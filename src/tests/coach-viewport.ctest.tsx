import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCoachViewport } from "@/components/coach/useCoachViewport";
afterEach(() => vi.unstubAllGlobals());
it("suit la surface visible à l'ouverture et fermeture du clavier, puis nettoie les listeners", () => {
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  const enlever = vi.spyOn(viewport, "removeEventListener");
  vi.stubGlobal("visualViewport", viewport);
  const { result, unmount } = renderHook(() => useCoachViewport(true));
  expect(result.current).toMatchObject({ "--coach-height": "844px" });
  act(() => { viewport.height = 430; viewport.offsetTop = 12; viewport.dispatchEvent(new Event("resize")); });
  expect(result.current).toMatchObject({ "--coach-height": "430px", "--coach-top": "12px" });
  act(() => { viewport.height = 844; viewport.offsetTop = 0; viewport.dispatchEvent(new Event("scroll")); });
  expect(result.current).toMatchObject({ "--coach-height": "844px", "--coach-top": "0px" });
  unmount(); expect(enlever).toHaveBeenCalledTimes(2);
});
