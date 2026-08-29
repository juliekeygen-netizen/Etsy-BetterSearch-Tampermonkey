'use strict';

(() => {
  const buildHarBase = buildHar;

  function collectExtraInfo(events) {
    const request = new Map();
    const response = new Map();
    for (const event of events || []) {
      if (event?.stream !== 'cdp') continue;
      const method = event.data?.method || event.type;
      const params = event.data?.params || {};
      const requestId = String(params.requestId || '');
      if (!requestId) continue;
      if (method === 'Network.requestWillBeSentExtraInfo') request.set(requestId, params);
      if (method === 'Network.responseReceivedExtraInfo') response.set(requestId, params);
    }
    return { request, response };
  }

  function cookieHeader(extraInfo) {
    const cookies = Array.isArray(extraInfo?.associatedCookies) ? extraInfo.associatedCookies : [];
    return cookies
      .map((entry) => entry?.cookie)
      .filter((cookie) => cookie?.name)
      .map((cookie) => `${cookie.name}=${cookie.value ?? ''}`)
      .join('; ');
  }

  function requestCookies(extraInfo) {
    const cookies = Array.isArray(extraInfo?.associatedCookies) ? extraInfo.associatedCookies : [];
    return cookies
      .map((entry) => entry?.cookie)
      .filter((cookie) => cookie?.name)
      .map((cookie) => ({ name: String(cookie.name), value: String(cookie.value ?? '') }));
  }

  function enrichedEvents(events, extra) {
    return (events || []).map((event) => {
      if (event?.stream !== 'cdp') return event;
      const method = event.data?.method || event.type;
      const params = event.data?.params || {};
      const requestId = String(params.requestId || '');
      if (!requestId) return event;

      if (method === 'Network.requestWillBeSent') {
        const info = extra.request.get(requestId);
        if (!info) return event;
        const request = params.request || {};
        const headers = { ...(request.headers || {}), ...(info.headers || {}) };
        const cookie = cookieHeader(info);
        const hasCookie = Object.keys(headers).some((name) => name.toLowerCase() === 'cookie');
        if (cookie && !hasCookie) headers.Cookie = cookie;
        return {
          ...event,
          data: {
            ...event.data,
            params: {
              ...params,
              request: { ...request, headers }
            }
          }
        };
      }

      if (method === 'Network.responseReceived') {
        const info = extra.response.get(requestId);
        if (!info) return event;
        const response = params.response || {};
        return {
          ...event,
          data: {
            ...event.data,
            params: {
              ...params,
              response: {
                ...response,
                headers: { ...(response.headers || {}), ...(info.headers || {}) }
              }
            }
          }
        };
      }
      return event;
    });
  }

  buildHar = function buildHarWithExtraInfo(session, events) {
    const extra = collectExtraInfo(events);
    const har = buildHarBase(session, enrichedEvents(events, extra));
    for (const entry of har?.log?.entries || []) {
      const requestId = String(entry?._requestId || '');
      if (!requestId) continue;
      const requestInfo = extra.request.get(requestId) || null;
      const responseInfo = extra.response.get(requestId) || null;
      if (requestInfo) {
        entry._requestExtraInfo = requestInfo;
        const cookies = requestCookies(requestInfo);
        if (cookies.length) entry.request.cookies = cookies;
      }
      if (responseInfo) entry._responseExtraInfo = responseInfo;
    }
    return har;
  };
})();
