/**
 * The console half of the output area: the scrolling line list, following
 * the bottom unless the user scrolls up, plus the stdin row.
 */
import { createEffect, on, onCleanup } from "solid-js";

import { output, spawnStatus } from "../spawn/controller";
import OutputLines from "./OutputLines";
import StdinRow from "./StdinRow";

export default function OutputConsole() {
  let scroller: HTMLDivElement | undefined;
  let following = true;

  const onScroll = () => {
    if (!scroller) return;
    following = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
  };

  // New lines: stick to the bottom if we were already there.
  createEffect(
    on(
      () => output.lines.length,
      () => {
        if (following && scroller) scroller.scrollTop = scroller.scrollHeight;
      },
    ),
  );

  // A fresh spawn always starts at the bottom.
  createEffect(
    on(spawnStatus, (status) => {
      if (status === "running") following = true;
    }),
  );

  onCleanup(() => output.flush());

  return (
    <>
      <div class="sp-output__scroller" ref={(el) => (scroller = el)} onScroll={onScroll}>
        <OutputLines lines={output.lines} />
      </div>
      <StdinRow />
    </>
  );
}
