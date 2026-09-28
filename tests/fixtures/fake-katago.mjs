import { createInterface } from 'node:readline';
const timers = new Map();
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.action === 'terminate') {
    clearTimeout(timers.get(request.terminateId));
    timers.delete(request.terminateId);
    return;
  }
  if (request.komi === 99) return;
  if (request.komi === 98) {
    process.exit(7);
  }
  if (request.komi === 97) {
    console.log(JSON.stringify({ id: request.id, error: 'invalid rules' }));
    return;
  }
  const data = {
    id: request.id,
    turnNumber: request.moves.length,
    rootInfo: { scoreLead: 1.5, winrate: 0.55, visits: request.maxVisits },
    moveInfos: [
      {
        move: 'D4',
        order: 0,
        visits: 90,
        prior: 0.5,
        scoreLead: 1.5,
        winrate: 0.55,
        pv: ['D4', 'E5'],
      },
    ],
    ownership: Array(request.boardXSize ** 2).fill(0.2),
    policy: Array(request.boardXSize ** 2 + 1).fill(0.01),
  };
  if (request.reportDuringSearchEvery)
    console.log(
      JSON.stringify({ ...data, rootInfo: { ...data.rootInfo, visits: 10 }, isDuringSearch: true }),
    );
  timers.set(
    request.id,
    setTimeout(
      () => console.log(JSON.stringify({ ...data, isDuringSearch: false })),
      request.komi === 96 ? 10000 : request.komi === 1 ? 30 : 5,
    ),
  );
});
