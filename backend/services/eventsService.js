/**
 * Live updates: every open app keeps one connection to GET /api/events and is told
 * "something changed" (e.g. { topic: 'matches', id }), then reloads what's on screen.
 *
 * The messages carry no private data (only a topic and an id), so screens always fetch
 * the real data through the normal, permission-checked API.
 */
const clients = new Set();

/** Keeps the response open as a Server-Sent Events stream. */
export const subscribe = (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    });
    const write = (chunk) => {
        res.write(chunk);
        res.flush?.(); // compression middleware would otherwise hold it back
    };
    write('retry: 5000\n\n');
    const client = { write };
    clients.add(client);
    // A comment every 25 s keeps proxies from closing a quiet connection.
    const ping = setInterval(() => write(': ping\n\n'), 25_000);
    req.on('close', () => {
        clearInterval(ping);
        clients.delete(client);
    });
};

/** Tells every open app that something changed. */
export const broadcast = (topic, data = {}) => {
    const msg = `data: ${JSON.stringify({ topic, ...data })}\n\n`;
    for (const c of clients) {
        try { c.write(msg); } catch { /* closed; cleaned up on 'close' */ }
    }
};

/** Which screens a successful change affects, from its API path (null: nothing others can see). */
export const topicFor = (method, path) => {
    if (method === 'GET') return null;
    const [, area, id] = path.split('/'); // '/matches/:id/rsvp' → ['', 'matches', ':id', 'rsvp']
    if (area === 'matches') return { topic: 'matches', ...(id && /^[a-f0-9]{24}$/i.test(id) ? { id } : {}) };
    if (area === 'polls') return { topic: 'polls' };
    if (area === 'organizer') return { topic: 'group' };
    if (area === 'me') {
        if (/^\/me\/(push|feedback|preferences)/.test(path)) return null; // private
        if (path.startsWith('/me/attendance')) return { topic: 'group' }; // a punctuality request for the organizer
        return { topic: 'players' }; // name, photo, position…
    }
    return null;
};
