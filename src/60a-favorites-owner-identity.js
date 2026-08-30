'use strict';

/* v0.15.3 Favorites owner identity boundary.
 *
 * Etsy can briefly leave the current Favorites route without a usable
 * text/props payload while soft navigation/hydration settles. The base scope
 * helper previously converted that temporary absence directly into owner:'',
 * which then became part of cache/index/network identity.
 *
 * Keep one verified profile-owner id per profile login for the lifetime of the
 * document. On a soft transition to a DIFFERENT login, do not bind the previous
 * route's still-mounted props to the new login. Once props expose a genuinely
 * different owner id for the new login, remember it normally.
 */
var favOwnerByLogin0153 = new Map();
var favLastOwnerIdentity0153 = { login:'', owner:'' };

function favOwnerIdentity0153(scope = {}) {
    const login = String(scope?.login || favProfileLogin?.() || '').trim();
    const direct = String(scope?.owner || '').trim();

    if (!login) return direct;

    const remembered = String(favOwnerByLogin0153.get(login) || '');
    if (remembered) {
        favLastOwnerIdentity0153 = { login, owner:remembered };
        return remembered;
    }

    /* During a people/A -> people/B soft transition, Etsy may leave A's props
     * mounted briefly after location already says B. Never teach the B login
     * that A's exact owner id is its owner. Wait for B's real props instead. */
    const previousLogin = String(favLastOwnerIdentity0153.login || '');
    const previousOwner = String(favLastOwnerIdentity0153.owner || '');
    const looksLikePreviousRouteProps = Boolean(
        direct
        && previousLogin
        && previousLogin !== login
        && previousOwner
        && direct === previousOwner
    );
    if (looksLikePreviousRouteProps) return '';

    if (direct) {
        favOwnerByLogin0153.set(login, direct);
        favLastOwnerIdentity0153 = { login, owner:direct };
        return direct;
    }

    if (previousLogin === login && previousOwner) return previousOwner;
    return '';
}

var favScopeBefore0153 = favScope;
favScope = function favScope0153() {
    const scope = favScopeBefore0153();
    return { ...scope, owner:favOwnerIdentity0153(scope) };
};
