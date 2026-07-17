// SSE subscription: each open page holds one stream, registered for broadcasts
// until it closes.
export default defineEventHandler((event) => {
  const stream = createEventStream(event);
  addClient(stream);
  stream.onClosed(() => {
    removeClient(stream);
    broadcastPresence();
  });
  // Announce the new count once the stream is live (runs after send()).
  queueMicrotask(broadcastPresence);
  return stream.send();
});
