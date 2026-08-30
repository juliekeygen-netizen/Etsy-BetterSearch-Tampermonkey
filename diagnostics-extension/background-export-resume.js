'use strict';

// v0.2.8 resumable ZIP-export job state.
//
// ZIP assembly still runs in the Etsy document because that is where Blob/object
// URL download support is available. The *intent and stopped raw capture* live in
// extension storage, however, so a refresh/tab close cannot turn an in-progress
// export into lost state. A later Etsy document can claim the job and rebuild the
// ZIP from the retained IndexedDB session.
(() => {
  const previousHandleMessage = handleMessage;
  const JOB_KEY = 'ebsf-diagnostics:resumable-export:v1';
  const HEARTBEAT_STALE_MS = 9000;

  async function readRawJob() {
    try {
      const stored = await chrome.storage.local.get(JOB_KEY);
      const job = stored?.[JOB_KEY] || null;
      return job?.sessionId ? job : null;
    } catch (_) {
      return null;
    }
  }

  async function writeJob(job) {
    const next = {
      version: 1,
      sessionId: String(job.sessionId || ''),
      status: job.status === 'failed' ? 'failed' : 'active',
      stage: String(job.stage || 'preparing').slice(0, 120),
      detail: String(job.detail || '').slice(0, 500),
      ownerTabId: Number.isInteger(job.ownerTabId) ? job.ownerTabId : null,
      createdAt: Number(job.createdAt || Date.now()),
      updatedAt: Date.now(),
      heartbeatAt: Number(job.heartbeatAt || Date.now()),
      attempt: Math.max(1, Number(job.attempt || 1)),
      error: String(job.error || '').slice(0, 1200)
    };
    await chrome.storage.local.set({ [JOB_KEY]: next });
    return next;
  }

  async function clearJob(sessionId = '') {
    const current = await readRawJob();
    if (!current) return;
    if (sessionId && String(current.sessionId) !== String(sessionId)) return;
    try { await chrome.storage.local.remove(JOB_KEY); } catch (_) {}
  }

  async function validatedJob() {
    const job = await readRawJob();
    if (!job) return { job: null, session: null };
    const session = await getSession(String(job.sessionId || ''));
    if (!session) {
      await clearJob(job.sessionId);
      return { job: null, session: null };
    }
    return { job, session };
  }

  async function ownerLooksAlive(job, senderTabId) {
    const ownerTabId = Number(job?.ownerTabId);
    if (!Number.isInteger(ownerTabId) || ownerTabId === senderTabId) return false;
    if (Date.now() - Number(job.heartbeatAt || 0) > HEARTBEAT_STALE_MS) return false;
    try {
      await chrome.tabs.get(ownerTabId);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function recoverClosedOwnerSession(session) {
    const oldTabId = Number(session?.tabId);
    if (!Number.isInteger(oldTabId) || session.stoppedAt) return session;
    try {
      await chrome.tabs.get(oldTabId);
      return null;
    } catch (_) {
      const stoppedAt = Date.now();
      session.recording = false;
      session.paused = false;
      session.debuggerAttached = false;
      session.debuggerDetachReason = session.debuggerDetachReason || 'export-owner-tab-closed';
      session.stoppedAt = stoppedAt;
      session.stoppedIso = new Date(stoppedAt).toISOString();
      session.recoverableAfterDetach = true;
      await putSession(session);
      try { await clearActive(oldTabId); } catch (_) {}
      try { runtimeByTab.delete(oldTabId); } catch (_) {}
      await addEvent(session.sessionId, 'recorder', 'export-owner-tab-closed-recovered', {
        tabId: oldTabId,
        stoppedAt
      });
      return session;
    }
  }

  async function startOrClaimJob(message, sender) {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) return { ok: false, error: 'Resumable export requires an Etsy tab.' };

    const requestedId = String(message.sessionId || '');
    const current = await validatedJob();
    if (current.job && current.job.status === 'active' && requestedId && current.job.sessionId !== requestedId) {
      return { ok: false, error: 'Another diagnostics ZIP export is already pending. Finish or resume it before starting another export.' };
    }

    let session = requestedId ? await getSession(requestedId) : null;
    let state = null;
    if (!session) {
      state = await previousHandleMessage({ action: 'get_state' }, sender);
      session = state?.session || state?.stopped || null;
    }
    if (!session?.sessionId) return { ok: false, error: 'No diagnostic recording is available to export.' };

    if (current.job && current.job.sessionId !== session.sessionId && current.session) {
      return { ok: false, error: 'Another diagnostics ZIP export is already pending. Reopen Etsy to let it finish first.' };
    }

    const existing = current.job?.sessionId === session.sessionId ? current.job : null;
    let job = await writeJob({
      sessionId: session.sessionId,
      status: 'active',
      stage: session.stoppedAt ? 'preparing' : 'stopping',
      detail: session.stoppedAt ? 'Preparing diagnostic ZIP…' : 'Stopping recording safely…',
      ownerTabId: tabId,
      createdAt: existing?.createdAt || Date.now(),
      heartbeatAt: Date.now(),
      attempt: Number(existing?.attempt || 0) + 1,
      error: ''
    });

    let stoppedNow = false;
    if (!session.stoppedAt) {
      if (Number(session.tabId) === tabId) {
        const stopped = await previousHandleMessage({ action: 'stop_recording' }, sender);
        if (!stopped?.ok || !stopped.session?.sessionId) {
          job = await writeJob({ ...job, status: 'failed', stage: 'failed', error: stopped?.error || 'Could not stop recording.' });
          return { ok: false, error: job.error, job };
        }
        session = stopped.session;
        stoppedNow = !stopped.alreadyStopped;
      } else {
        const recovered = await recoverClosedOwnerSession(session);
        if (!recovered) {
          job = await writeJob({
            ...job,
            status: 'failed',
            stage: 'failed',
            error: 'The recording is still active in another open tab. Finish the export from that tab.'
          });
          return { ok: false, error: job.error, job };
        }
        session = recovered;
        stoppedNow = true;
      }
    }

    job = await writeJob({
      ...job,
      status: 'active',
      stage: 'preparing',
      detail: message.resume ? 'Resuming interrupted ZIP export…' : 'Preparing diagnostic ZIP…',
      ownerTabId: tabId,
      heartbeatAt: Date.now(),
      error: ''
    });
    return { ok: true, session, stoppedNow, resumed: Boolean(existing), job };
  }

  async function getJobForTab(sender) {
    const tabId = sender.tab?.id;
    const current = await validatedJob();
    if (!current.job) return { ok: true, job: null, session: null, autoResume: false };
    if (current.job.status === 'failed') {
      return { ok: true, job: current.job, session: current.session, autoResume: false, failed: true };
    }
    const ownedElsewhere = await ownerLooksAlive(current.job, tabId);
    return {
      ok: true,
      job: current.job,
      session: current.session,
      autoResume: !ownedElsewhere,
      ownedElsewhere
    };
  }

  async function heartbeatJob(message, sender) {
    const current = await validatedJob();
    const id = String(message.sessionId || '');
    if (!current.job || current.job.sessionId !== id || current.job.status !== 'active') return { ok: false, error: 'Active export job was not found.' };
    const tabId = sender.tab?.id;
    const job = await writeJob({
      ...current.job,
      ownerTabId: Number.isInteger(tabId) ? tabId : current.job.ownerTabId,
      heartbeatAt: Date.now(),
      detail: message.detail == null ? current.job.detail : String(message.detail)
    });
    return { ok: true, job };
  }

  async function failJob(message) {
    const current = await readRawJob();
    const id = String(message.sessionId || '');
    if (!current || current.sessionId !== id) return { ok: true, ignored: true };
    const job = await writeJob({
      ...current,
      status: 'failed',
      stage: 'failed',
      error: String(message.error || 'Export failed; recording retained.'),
      detail: 'Export failed · data retained'
    });
    return { ok: true, job };
  }

  handleMessage = async function handleMessageWithResumableExport(message, sender) {
    switch (message?.action) {
      case 'start_resumable_export_job':
        return startOrClaimJob(message, sender);
      case 'get_resumable_export_job':
        return getJobForTab(sender);
      case 'heartbeat_resumable_export_job':
        return heartbeatJob(message, sender);
      case 'fail_resumable_export_job':
        return failJob(message);
      case 'clear_resumable_export_job':
        await clearJob(String(message.sessionId || ''));
        return { ok: true };
      case 'finalize_stream_export': {
        const id = String(message.sessionId || '');
        const result = await previousHandleMessage(message, sender);
        if (result?.ok) await clearJob(id);
        return result;
      }
      case 'discard_stream_recording':
      case 'discard_recording':
      case 'finalize_export': {
        const id = String(message.sessionId || '');
        const result = await previousHandleMessage(message, sender);
        if (result?.ok && id) await clearJob(id);
        return result;
      }
      default:
        return previousHandleMessage(message, sender);
    }
  };
})();
