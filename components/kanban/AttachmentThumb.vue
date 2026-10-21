<template>
  <div
    class="bg-elevation-2 relative overflow-hidden rounded-md"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <img
      v-if="displaySrc"
      :src="displaySrc"
      :alt="alt"
      class="h-full w-full object-cover"
      decoding="async"
      draggable="false"
    />
    <span
      v-if="isGif && !hovered"
      class="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-semibold leading-4 text-white"
      >GIF</span
    >
  </div>
</template>

<script setup lang="ts">
import { isGifFile } from "@/composables/useAttachments";

const props = defineProps<{
  alt?: string;
  file: string;
  src: string;
}>();

const MAX_THUMB_SIZE = 320;

// shared across instances so each image is decoded and downscaled only once
const thumbCache = new Map<string, string>();

const isGif = computed(() => isGifFile(props.file));
const hovered = ref(false);
const thumbSrc = ref("");

const displaySrc = computed(() =>
  isGif.value && hovered.value ? props.src : thumbSrc.value
);

const buildThumbnail = (src: string) =>
  new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      const scale = Math.min(1, MAX_THUMB_SIZE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(blob ? URL.createObjectURL(blob) : src);
      }, "image/webp", 0.8);
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

watch(
  () => props.src,
  async (src) => {
    if (!src) return;
    const cached = thumbCache.get(src);
    if (cached) {
      thumbSrc.value = cached;
      return;
    }
    const thumb = await buildThumbnail(src);
    thumbCache.set(src, thumb);
    thumbSrc.value = thumb;
  },
  { immediate: true }
);
</script>
