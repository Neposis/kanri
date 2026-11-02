<template>
  <div
    v-if="state.canScroll"
    class="group/scroll fixed bottom-1.5 left-[4.75rem] right-4 z-40 flex flex-row items-center gap-1.5 opacity-60 transition-opacity duration-200 hover:opacity-100"
  >
    <button
      class="bg-elevation-2 bg-elevation-3-hover flex size-4 shrink-0 items-center justify-center rounded-full"
      @click="scrollByPage(-1)"
    >
      <PhCaretLeft class="size-2.5" />
    </button>
    <div
      ref="track"
      class="bg-elevation-1 relative h-1.5 flex-1 cursor-pointer rounded-full transition-all duration-150 group-hover/scroll:h-2"
      @pointerdown.prevent="onTrackDown"
      @pointermove="onTrackMove"
      @pointerup="onTrackUp"
      @pointercancel="onTrackUp"
    >
      <div
        class="bg-accent absolute top-0 h-full rounded-full opacity-80 hover:opacity-100"
        :style="{ left: `${state.thumbLeft}%`, width: `${state.thumbWidth}%` }"
      />
    </div>
    <button
      class="bg-elevation-2 bg-elevation-3-hover flex size-4 shrink-0 items-center justify-center rounded-full"
      @click="scrollByPage(1)"
    >
      <PhCaretRight class="size-2.5" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { PhCaretLeft, PhCaretRight } from "@phosphor-icons/vue";

const props = defineProps<{
  target: HTMLElement | null;
}>();

const track: Ref<HTMLDivElement | null> = ref(null);
const state = ref({ canScroll: false, thumbLeft: 0, thumbWidth: 100 });
let drag: { startScroll: number; startX: number } | null = null;
let observer: ResizeObserver | null = null;

const update = () => {
  const el = props.target;
  if (!el || el.scrollWidth <= el.clientWidth + 1) {
    state.value = { canScroll: false, thumbLeft: 0, thumbWidth: 100 };
    return;
  }
  const thumbWidth = Math.max((el.clientWidth / el.scrollWidth) * 100, 8);
  const maxScroll = el.scrollWidth - el.clientWidth;
  state.value = {
    canScroll: true,
    thumbLeft: (el.scrollLeft / maxScroll) * (100 - thumbWidth),
    thumbWidth,
  };
};

const scrollByPage = (direction: number) => {
  const el = props.target;
  if (!el) return;
  el.scrollBy({ left: direction * el.clientWidth * 0.6, behavior: "smooth" });
};

const onTrackDown = (event: PointerEvent) => {
  const el = props.target;
  const trackEl = track.value;
  if (!el || !trackEl) return;

  trackEl.setPointerCapture(event.pointerId);
  const rect = trackEl.getBoundingClientRect();
  const maxScroll = el.scrollWidth - el.clientWidth;
  const thumbPx = (state.value.thumbWidth / 100) * rect.width;
  const thumbStartPx = (state.value.thumbLeft / 100) * rect.width;
  const clickX = event.clientX - rect.left;

  // clicking outside the thumb jumps there, then dragging continues from that point
  if (clickX < thumbStartPx || clickX > thumbStartPx + thumbPx) {
    el.scrollLeft = ((clickX - thumbPx / 2) / (rect.width - thumbPx)) * maxScroll;
  }
  drag = { startScroll: el.scrollLeft, startX: event.clientX };
};

const onTrackMove = (event: PointerEvent) => {
  const el = props.target;
  const trackEl = track.value;
  if (!drag || !el || !trackEl) return;

  const trackWidth = trackEl.getBoundingClientRect().width;
  const thumbPx = (state.value.thumbWidth / 100) * trackWidth;
  const maxScroll = el.scrollWidth - el.clientWidth;
  el.scrollLeft =
    drag.startScroll + ((event.clientX - drag.startX) / (trackWidth - thumbPx)) * maxScroll;
};

const onTrackUp = (event: PointerEvent) => {
  drag = null;
  track.value?.releasePointerCapture(event.pointerId);
};

watch(
  () => props.target,
  (el, old) => {
    old?.removeEventListener("scroll", update);
    observer?.disconnect();
    if (!el) return;

    el.addEventListener("scroll", update, { passive: true });
    // the container itself and its content both change size (window resize, columns added, width drags)
    observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    update();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  props.target?.removeEventListener("scroll", update);
  observer?.disconnect();
});
</script>
