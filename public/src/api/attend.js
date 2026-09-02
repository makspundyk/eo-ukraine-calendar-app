/**
 * The two writes. Everything the browser SENDS goes through here, as everything it reads goes
 * through http.js — so there is one place to look when the endpoints move behind a gateway.
 *
 * Neither ever throws: a member who pressed a button gets a sentence back, never a stack. The
 * caller decides where the sentence goes — inline under a form, or a toast from a card.
 */
const post = async (url, payload) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch {
    return { ok: false, reason: 'unreachable',
             message: 'That did not work. Try again in a moment.' };
  }
};

/**
 * Put one address on the organiser's calendar event.
 * The calendar event id is resolved SERVER-side from our public id; it is never sent from here.
 * @param {{event:string, email:string, subscribe?:boolean}} input
 */
export const requestInvitation = (input) => post('/api/attend', input);

/**
 * Record that somebody is interested in ONE event. No calendar entry, no email, no guest
 * list — the address goes into that row's `Interested Emails` cell and nowhere else.
 * @param {{event:string, email:string, subscribe?:boolean}} input
 */
export const requestInterest = (input) => post('/api/interest', input);

/** Join the chapter's list. @param {{email:string, name?:string}} input */
export const requestSubscription = (input) => post('/api/subscribe', input);
