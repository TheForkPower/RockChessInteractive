import { describe, expect, it } from "vitest";
import { formatDuration, ResponseTimer } from "./timing";

const s = (n: number) => n * 1000;

describe("response timer", () => {
  it("counts the time from the card appearing to the answer", () => {
    const timer = new ResponseTimer(0);
    timer.activity(s(5));
    timer.firstMove(s(8));
    const timing = timer.complete(s(12));
    expect(timing.activeMs).toBe(s(12));
    expect(timing.elapsedMs).toBe(s(12));
    expect(timing.firstMoveActiveMs).toBe(s(8));
    expect(timing.idleMs).toBe(0);
    expect(timing.reliable).toBe(true);
  });

  it("counts a short pause as thinking", () => {
    const timer = new ResponseTimer(0, s(30));
    timer.activity(s(25));
    expect(timer.complete(s(25)).activeMs).toBe(s(25));
  });

  it("counts a long pause as thinking up to the limit, and the rest as idle", () => {
    const timer = new ResponseTimer(0, s(30));
    timer.activity(s(5));
    const timing = timer.complete(s(105)); // 100 s with nothing happening
    expect(timing.activeMs).toBe(s(5 + 30));
    expect(timing.idleMs).toBe(s(70));
    expect(timing.elapsedMs).toBe(s(105));
    expect(timing.flags).toEqual(["idle"]);
    expect(timing.reliable).toBe(false);
  });

  it("uses the idle limit it is given", () => {
    const timer = new ResponseTimer(0, s(10));
    const timing = timer.complete(s(40));
    expect(timing.activeMs).toBe(s(10));
    expect(timing.idleMs).toBe(s(30));
  });

  it("keeps time with the tab hidden out of the active time", () => {
    const timer = new ResponseTimer(0);
    timer.activity(s(4));
    timer.hide(s(6));
    timer.show(s(46));
    const timing = timer.complete(s(50));
    expect(timing.hiddenMs).toBe(s(40));
    expect(timing.activeMs).toBe(s(6 + 4));
    expect(timing.flags).toEqual(["hidden"]);
    expect(timing.reliable).toBe(false);
  });

  it("doesn't mind a brief look away", () => {
    const timer = new ResponseTimer(0);
    timer.hide(s(3));
    timer.show(s(5));
    const timing = timer.complete(s(9));
    expect(timing.hiddenMs).toBe(s(2));
    expect(timing.reliable).toBe(true);
  });

  it("finishing while the tab is hidden closes the hidden time", () => {
    const timer = new ResponseTimer(0);
    timer.hide(s(2));
    const timing = timer.complete(s(12));
    expect(timing.hiddenMs).toBe(s(10));
    expect(timing.activeMs).toBe(s(2));
  });

  it("flags a very long card as unreliable without removing its time", () => {
    const timer = new ResponseTimer(0, s(30));
    for (let t = 20; t <= 700; t += 20) timer.activity(s(t));
    const timing = timer.complete(s(700));
    expect(timing.activeMs).toBe(s(700));
    expect(timing.flags).toEqual(["long"]);
  });

  it("only the first move counts as the first move", () => {
    const timer = new ResponseTimer(0);
    timer.firstMove(s(3));
    timer.firstMove(s(9));
    expect(timer.complete(s(10)).firstMoveActiveMs).toBe(s(3));
  });

  it("stops changing once complete", () => {
    const timer = new ResponseTimer(0);
    const first = timer.complete(s(5));
    timer.activity(s(60));
    timer.hide(s(61));
    expect(timer.complete(s(100))).toEqual(first);
    expect(timer.snapshot().activeMs).toBe(s(5));
  });

  it("ignores clocks that go backwards", () => {
    const timer = new ResponseTimer(s(10));
    timer.activity(s(5));
    expect(timer.complete(s(8)).activeMs).toBe(0);
  });
});

describe("formatDuration", () => {
  it("writes seconds and minutes", () => {
    expect(formatDuration(4200)).toBe("4 s");
    expect(formatDuration(60_000)).toBe("1 min");
    expect(formatDuration(95_000)).toBe("1 min 35 s");
  });
});
