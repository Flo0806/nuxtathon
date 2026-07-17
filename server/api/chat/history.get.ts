export default defineEventHandler(async () => {
  return { messages: await readMessages() };
});
