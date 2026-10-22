<!-- SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, Khusyasy, PwshLab, jynxbt, tareqdayya, qunm00 -->
<!-- -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <div
        ref="cardRef"
        :class="[
          name === '---' ? 'separator-card' : zoomClass,
          cardBackgroundColor.startsWith('#') ? '' : cardBackgroundColor,
          cardTextColor,
        ]"
        :style="[
          cardBackgroundColor.startsWith('#')
            ? { 'background-color': cardBackgroundColor }
            : {},
        ]"
        class="kanban-card border-elevation-3 flex min-h-[30px] w-full cursor-pointer flex-col items-start gap-1 rounded-[3px] border p-3"
        @click.self="$emit('openEditCardModal', card)"
      >
        <div
          :class="{ 'pb-1': cardHasNoExtraProperties, 'flex-wrap': hasProgress }"
          class="flex w-full flex-row items-start justify-between"
        >
          <button
            v-if="name !== '---'"
            type="button"
            class="group mr-2 mt-[4px] shrink-0 cursor-pointer"
            :class="card.done ? 'text-green-500' : cardTextColorDim"
            @click.stop="emit('setCardDone', card.id, !card.done)"
            @contextmenu.stop.prevent="deleteCardWithConfirmation(card.id)"
          >
            <span class="relative block" :class="iconSizeClass">
              <PhCircle
                class="absolute inset-0 size-full transition-all duration-200"
                :class="card.done ? 'scale-50 opacity-0' : 'group-hover:scale-75 group-hover:opacity-0'"
              />
              <PhCheckCircle
                weight="fill"
                class="absolute inset-0 size-full text-green-500 transition-all duration-200"
                :class="
                  card.done
                    ? 'scale-100 opacity-100 group-hover:opacity-60'
                    : 'scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-70'
                "
              />
            </span>
          </button>
          <div
            v-if="hasProgress"
            class="mr-2 mt-[4px] flex min-w-0 flex-1 flex-row items-center gap-2 self-center"
            @click="$emit('openEditCardModal', card)"
          >
            <div
              v-if="!compactProgress"
              class="bg-elevation-3 h-1.5 flex-1 overflow-hidden rounded-full"
            >
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="progressColor.bar"
                :style="{ width: `${card.progress}%` }"
              />
            </div>
            <span class="shrink-0 text-xs font-semibold" :class="progressColor.text">
              {{ card.progress }}%
            </span>
          </div>
          <div
            class="mr-2 flex w-full min-w-[28px] flex-row items-start gap-2"
            :class="{ 'order-1 mt-1 basis-full': hasProgress }"
          >
            <p class="text-no-overflow min-w-0 flex-1">
              <ClickCounter
                v-if="!cardNameEditMode"
                @double-click="enableCardEditMode"
                @single-click="$emit('openEditCardModal', card)"
              >
                <hr v-if="name === '---'" class="mt-0.5" >
                <p v-else ref="cardNameText">
                  {{ name }}
                </p>
              </ClickCounter>
              <textarea
                v-else
                ref="cardNameInput"
                v-model="name"
                v-focus
                v-resizable
                class="bg-elevation-3 text-normal m-0 size-full resize-none rounded-sm p-0 focus:outline-none"
                maxlength="1000"
                type="text"
                @blur="updateCardName"
                @keypress.enter="updateCardName"
              />
            </p>
            <span
              v-if="card.priority && name !== '---'"
              class="mt-[2px] shrink-0 rounded-md px-1.5 text-xs font-bold leading-5"
              :class="priorityClass"
              @click="$emit('openEditCardModal', card)"
            >
              P{{ card.priority }}
            </span>
          </div>
        </div>

        <div
          v-if="cardTags && cardTags?.length > 0"
          class="-ml-0.5 -mt-0.5 mb-1 flex flex-row flex-wrap items-center gap-1"
          @click="$emit('openEditCardModal', card)"
        >
          <div v-for="tag in cardTags" :key="tag.id">
            <KanbanTagDisplay :tag="tag" :zoom-level="zoomLevel" />
          </div>
        </div>

        <div
          class="flex flex-row flex-wrap items-center gap-2"
          @click="$emit('openEditCardModal', card)"
        >
          <PhTextAlignLeft
            v-if="!isDescriptionEmpty"
            :class="[cardTextColorDim, iconSizeClass]"
          />

          <div
            v-if="tasks && taskCompletionStatus !== '0/0'"
            :class="{
              'bg-accent text-buttons rounded-sm px-1': allTasksCompleted,
            }"
            class="flex cursor-pointer flex-row items-center gap-1"
            @click.stop="toggleTasksExpanded"
          >
            <PhChecks
              v-if="allTasksCompleted"
              class="text-buttons"
              :class="iconSizeClass"
            />
            <PhListChecks v-else :class="[cardTextColorDim, iconSizeClass]" />
            <span
              :class="[
                allTasksCompleted ? 'text-buttons' : cardTextColorDim,
                taskTextClass,
              ]"
              >{{ taskCompletionStatus }}</span
            >
            <PhCaretDown
              class="transition-transform duration-200"
              :class="[
                allTasksCompleted ? 'text-buttons' : cardTextColorDim,
                iconSizeClass,
                { 'rotate-180': card.tasksExpanded },
              ]"
            />
          </div>

          <div
            v-if="dueDate"
            class="flex flex-row items-center gap-1"
            :class="{
              'text-buttons bg-accent rounded-sm px-1': isDueDateCompleted,
              'text-buttons rounded-sm bg-red-600 px-1': dueDateOverdue && !isDueDateCompleted,
            }"
          >
            <PhCheckCircle
              v-if="isDueDateCompleted"
              class="text-buttons"
              :class="iconSizeClass"
            />
            <PhClock v-else :class="iconSizeClass" />
            <span :class="taskTextClass">{{ getFormattedDueDate }}</span>
          </div>
        </div>

        <div
          v-if="card.tasksExpanded && tasks && tasks.length > 0"
          class="task-list custom-scrollbar max-h-24 w-full overflow-y-auto rounded-sm pr-1"
          :class="taskTextClass"
        >
          <label
            v-for="task in tasks"
            :key="task.id ?? task.name"
            class="flex cursor-pointer flex-row items-start gap-1.5 py-0.5"
          >
            <input
              type="checkbox"
              class="accent-accent mt-[3px] shrink-0 cursor-pointer"
              :checked="task.finished"
              @change="toggleTask(task)"
            >
            <span :class="{ 'line-through opacity-60': task.finished }">{{ task.name }}</span>
          </label>
        </div>

        <div
          v-if="stackedAttachments.length > 0"
          class="flex flex-row items-center pt-1"
          @mouseleave="hoveredAttachment = null"
        >
          <div
            v-for="(attachment, index) in stackedAttachments"
            :key="attachment.id"
            class="border-elevation-1 relative h-9 w-14 shrink-0 cursor-zoom-in rounded-md border-2 shadow-md transition-transform duration-150 hover:-translate-y-1"
            :class="{ '-ml-9': index > 0 }"
            :style="{ zIndex: stackedAttachments.length - index }"
            @click.stop="openFullscreen(attachment)"
            @mouseenter="onAttachmentEnter($event, attachment)"
          >
            <KanbanAttachmentThumb
              v-if="attachmentUrls[attachment.id]"
              class="size-full"
              :file="attachment.file"
              :src="attachmentUrls[attachment.id]"
            />
            <PhLink
              v-if="attachment.path"
              class="absolute right-0.5 top-0.5 size-3 rounded-sm bg-black/60 p-px text-white"
            />
          </div>
          <span
            v-if="imageAttachments.length > stackedAttachments.length"
            class="text-dim-1 ml-2 text-xs"
            >+{{ imageAttachments.length - stackedAttachments.length }}</span
          >
        </div>
        <div v-if="fileAttachments.length > 0" class="task-list w-fit min-w-0 max-w-full pt-1">
          <div
            ref="fileRow"
            class="file-row flex flex-row gap-1 overflow-x-auto"
            @scroll="updateFileScroll"
            @wheel="onFileRowWheel"
          >
            <button
              v-for="attachment in fileAttachments"
              :key="attachment.id"
              class="bg-elevation-2 bg-elevation-3-hover flex max-w-28 shrink-0 items-center gap-1 rounded-md px-1.5 py-1"
              :class="[taskTextClass, { 'opacity-60': isAttachmentMissing(attachment) }]"
              :title="
                isAttachmentMissing(attachment)
                  ? `${attachment.name} (${$t('modals.editCard.attachmentMissing')})`
                  : (attachment.path ?? attachment.name)
              "
              @click.stop="openAttachment(attachment)"
            >
              <PhWarning
                v-if="isAttachmentMissing(attachment)"
                class="shrink-0 text-yellow-500"
                :class="iconSizeClass"
              />
              <PhLink v-else-if="attachment.path" class="shrink-0" :class="iconSizeClass" />
              <PhFile v-else class="shrink-0" :class="iconSizeClass" />
              <span
                class="truncate"
                :class="{ 'line-through': isAttachmentMissing(attachment) }"
                >{{ attachment.name }}</span
              >
            </button>
          </div>
          <div
            v-if="fileScroll.canScroll"
            ref="fileTrack"
            class="relative mt-1 h-1 cursor-pointer rounded-full bg-black/25"
            @click.stop
            @pointerdown.stop.prevent="onFileTrackDown"
            @pointermove="onFileTrackMove"
            @pointerup="onFileTrackUp"
            @pointercancel="onFileTrackUp"
          >
            <div
              class="bg-accent absolute top-0 h-full rounded-full opacity-80 hover:opacity-100"
              :style="{
                left: `${fileScroll.thumbLeft}%`,
                width: `${fileScroll.thumbWidth}%`,
              }"
            />
          </div>
        </div>
        <Teleport to="body">
          <Transition name="attachment-preview">
            <img
              v-if="hoveredAttachment && attachmentUrls[hoveredAttachment.id]"
              :src="attachmentUrls[hoveredAttachment.id]"
              class="pointer-events-none fixed z-[1000] max-h-64 max-w-[20rem] rounded-md object-contain shadow-2xl"
              :style="previewStyle"
            >
          </Transition>
          <div
            v-if="fullscreenAttachment && attachmentUrls[fullscreenAttachment.id]"
            class="fixed inset-0 z-[10000001] flex cursor-zoom-out items-center justify-center bg-black/80 p-8"
            @click.stop="fullscreenAttachment = null"
          >
            <img
              :src="attachmentUrls[fullscreenAttachment.id]"
              :alt="fullscreenAttachment.name"
              class="max-h-full max-w-full rounded-md object-contain"
            >
          </div>
        </Teleport>
      </div>
    </ContextMenuTrigger>
    <ContextMenuPortal to=".default-layout">
      <ContextMenuContent :class="contextMenuClass">
        <ContextMenuItem
          value="Edit Name"
          class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
          @click="enableCardEditMode()"
        >
          {{ $t("general.editNameAction") }}
        </ContextMenuItem>
        <KanbanMoveTo :card="card" />
        <ContextMenuItem
          value="Duplicate"
          class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
          @click="$emit('duplicateCard', card.id)"
        >
          {{ $t("general.duplicateAction") }}
        </ContextMenuItem>
        <ContextMenuItem
          value="Delete"
          class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
          @click="deleteCardWithConfirmation(card.id)"
        >
          {{ $t("general.deleteAction") }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import type { Attachment, Card, Tag, Task } from "@/types/kanban-types";

import { getContrast } from "~/utils/colorUtils";
import {
  PhCheckCircle,
  PhCaretDown,
  PhCircle,
  PhFile,
  PhLink,
  PhWarning,
  PhChecks,
  PhClock,
  PhListChecks,
  PhTextAlignLeft,
} from "@phosphor-icons/vue";

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
} from "radix-vue";

const props = defineProps<{
  card: Card;
  zoomLevel: number;
  compactProgress?: boolean;
}>();

const emit = defineEmits<{
  (e: "disableDragging"): void;
  (e: "enableDragging"): void;
  (e: "openEditCardModal", card: Card): void;
  (e: "removeCard", id: string | undefined): void;
  (
    e: "removeCardWithConfirmation",
    cardId: string | undefined,
    cardRef: Ref<HTMLDivElement | null>
  ): void;
  (e: "setCardName", cardId: string | undefined, name: string): void;
  (e: "setCardDone", cardId: string | undefined, done: boolean): void;
  (e: "setCardAttachments", cardId: string | undefined, attachments: Array<Attachment>): void;
  (e: "setCardTasks", cardId: string | undefined, tasks: Array<Task>): void;
  (e: "setCardTasksExpanded", cardId: string | undefined, expanded: boolean): void;
  (e: "updateCardTags", cardId: string | undefined, tags: Array<Tag>): void;
  (e: "duplicateCard", cardId: string | undefined): void;
}>();

const { locale } = useI18n();

const globalSettingsStore = useSettingsStore();
const themeStore = useThemeStore();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const savedColors: Ref<any> = ref(null); // TODO: add types for saved theme in board
const cardRef: Ref<HTMLDivElement | null> = ref(null);

const name = ref(props.card.name);
const description = ref(props.card.description);
const tasks = ref(props.card.tasks);
const dueDate = ref(props.card.dueDate);
const isDueDateRelative = ref(props.card.isDueDateCounterRelative);
const isDueDateCompleted = ref(props.card.isDueDateCompleted ?? false);
const cardTags = ref(props.card.tags);

const cardNameEditMode = ref(false);
const cardNameInput: Ref<HTMLTextAreaElement | null> = ref(null);
const cardNameText: Ref<HTMLParagraphElement | null> = ref(null);

const { attachmentExists, getAttachmentUrl, revealAttachment } = useAttachments();

const removeMissingAttachment = (attachment: Attachment) => {
  emit(
    "setCardAttachments",
    props.card.id,
    (props.card.attachments ?? []).filter((a) => a.id !== attachment.id)
  );
};

const openAttachment = async (attachment: Attachment) => {
  if (!(await revealAttachment(attachment))) removeMissingAttachment(attachment);
};

// drops entries whose stored file has been deleted outside the app
const pruneMissingAttachments = async () => {
  const list = props.card.attachments ?? [];
  if (list.length === 0) return;

  const present = await Promise.all(list.map(attachmentExists));
  if (present.every(Boolean)) return;
  emit(
    "setCardAttachments",
    props.card.id,
    list.filter((_, i) => present[i])
  );
};
onMounted(pruneMissingAttachments);
const attachmentUrls: Ref<Record<string, string>> = ref({});
const hoveredAttachment: Ref<Attachment | null> = ref(null);
const previewStyle = ref<Record<string, string>>({});
const imageAttachments = computed(() =>
  (props.card.attachments ?? []).filter(
    (a) => isImageFile(a.file) && !isAttachmentMissing(a)
  )
);
const fileAttachments = computed(() =>
  (props.card.attachments ?? []).filter(
    (a) => !isImageFile(a.file) || isAttachmentMissing(a)
  )
);
const stackedAttachments = computed(() => imageAttachments.value.slice(0, 4));

watch(
  () => props.card.attachments,
  async () => {
    for (const attachment of imageAttachments.value) {
      if (!attachmentUrls.value[attachment.id]) {
        attachmentUrls.value[attachment.id] = await getAttachmentUrl(attachment);
      }
    }
  },
  { deep: true, immediate: true }
);

const priorityClass = computed(() => priorityClasses[props.card.priority ?? 0] ?? "");

const progressColor = computed(() => {
  const value = props.card.progress ?? 0;
  if (value >= 100) return { bar: "bg-green-500", text: "text-green-500" };
  if (value >= 75) return { bar: "bg-lime-500", text: "text-lime-500" };
  if (value >= 50) return { bar: "bg-yellow-500", text: "text-yellow-500" };
  if (value >= 25) return { bar: "bg-orange-500", text: "text-orange-500" };
  return { bar: "bg-red-500", text: "text-red-500" };
});

const fileRow: Ref<HTMLDivElement | null> = ref(null);
const fileTrack: Ref<HTMLDivElement | null> = ref(null);
const fileScroll = ref({ canScroll: false, thumbLeft: 0, thumbWidth: 100 });
let fileDrag: { startScroll: number; startX: number } | null = null;

const updateFileScroll = () => {
  const el = fileRow.value;
  if (!el || el.scrollWidth <= el.clientWidth + 1) {
    fileScroll.value = { canScroll: false, thumbLeft: 0, thumbWidth: 100 };
    return;
  }
  const thumbWidth = Math.max((el.clientWidth / el.scrollWidth) * 100, 10);
  const maxScroll = el.scrollWidth - el.clientWidth;
  fileScroll.value = {
    canScroll: true,
    thumbLeft: (el.scrollLeft / maxScroll) * (100 - thumbWidth),
    thumbWidth,
  };
};

const onFileTrackDown = (event: PointerEvent) => {
  const el = fileRow.value;
  const track = fileTrack.value;
  if (!el || !track) return;

  track.setPointerCapture(event.pointerId);
  const rect = track.getBoundingClientRect();
  const maxScroll = el.scrollWidth - el.clientWidth;
  const thumbPx = (fileScroll.value.thumbWidth / 100) * rect.width;
  const thumbStartPx = (fileScroll.value.thumbLeft / 100) * rect.width;
  const clickX = event.clientX - rect.left;

  // clicking outside the thumb jumps there, then dragging continues from that point
  if (clickX < thumbStartPx || clickX > thumbStartPx + thumbPx) {
    el.scrollLeft = ((clickX - thumbPx / 2) / (rect.width - thumbPx)) * maxScroll;
  }
  fileDrag = { startScroll: el.scrollLeft, startX: event.clientX };
};

const onFileTrackMove = (event: PointerEvent) => {
  const el = fileRow.value;
  const track = fileTrack.value;
  if (!fileDrag || !el || !track) return;

  const trackWidth = track.getBoundingClientRect().width;
  const thumbPx = (fileScroll.value.thumbWidth / 100) * trackWidth;
  const maxScroll = el.scrollWidth - el.clientWidth;
  el.scrollLeft =
    fileDrag.startScroll +
    ((event.clientX - fileDrag.startX) / (trackWidth - thumbPx)) * maxScroll;
};

const onFileTrackUp = (event: PointerEvent) => {
  fileDrag = null;
  fileTrack.value?.releasePointerCapture(event.pointerId);
};

watch(fileAttachments, () => nextTick(updateFileScroll), { immediate: true });
watch(fileRow, (el) => {
  if (!el) return;
  new ResizeObserver(updateFileScroll).observe(el);
  updateFileScroll();
});

// lets a regular mouse wheel scroll the row sideways
const onFileRowWheel = (event: WheelEvent) => {
  const el = event.currentTarget as HTMLElement;
  if (el.scrollWidth <= el.clientWidth || event.deltaX !== 0) return;
  el.scrollLeft += event.deltaY;
  event.preventDefault();
};

const fullscreenAttachment: Ref<Attachment | null> = ref(null);

const openFullscreen = (attachment: Attachment) => {
  hoveredAttachment.value = null;
  fullscreenAttachment.value = attachment;
};

const closeFullscreenOnEscape = (event: KeyboardEvent) => {
  if (event.key === "Escape") fullscreenAttachment.value = null;
};

watch(fullscreenAttachment, (value) => {
  if (value) window.addEventListener("keydown", closeFullscreenOnEscape);
  else window.removeEventListener("keydown", closeFullscreenOnEscape);
});

onBeforeUnmount(() =>
  window.removeEventListener("keydown", closeFullscreenOnEscape)
);

const onAttachmentEnter = (event: MouseEvent, attachment: Attachment) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const left = Math.min(Math.max(rect.left + rect.width / 2 - 160, 8), window.innerWidth - 328);
  previewStyle.value = {
    bottom: `${window.innerHeight - rect.top + 8}px`,
    left: `${left}px`,
  };
  hoveredAttachment.value = attachment;
};
watch(
  props,
  (_, newData) => {
    name.value = newData.card.name;
    description.value = newData.card.description;
    tasks.value = newData.card.tasks;
    dueDate.value = newData.card.dueDate;
    isDueDateRelative.value = newData.card.isDueDateCounterRelative;
    cardTags.value = newData.card.tags;
    isDueDateCompleted.value = newData.card.isDueDateCompleted ?? false;
  },
  { deep: true }
);

onMounted(() => {
  savedColors.value = themeStore.colors;
});

const cardHasNoExtraProperties = computed(() => {
  return (
    (!tasks.value || tasks.value.length === 0) &&
    isDescriptionEmpty &&
    !dueDate.value &&
    (props.card.tags || []).length === 0 &&
    !props.card.name.startsWith("---")
  );
});

const isDescriptionEmpty = computed(() => {
  if (!description.value) return true;
  if (description.value == "<p></p>" || !/\S/.test(description.value))
    return true;

  return false;
});

const toggleTasksExpanded = () => {
  emit("setCardTasksExpanded", props.card.id, !props.card.tasksExpanded);
};

const toggleTask = (task: Task) => {
  if (!tasks.value) return;
  const next = tasks.value.map((t) =>
    t === task ? { ...t, finished: !t.finished } : t
  );
  emit("setCardTasks", props.card.id, next);
};

const taskCompletionStatus = computed(() => {
  if (!tasks.value) return "0/0";

  return `${countFinishedTasks(tasks.value)}/${tasks.value.length}`;
});

const allTasksCompleted = computed(() => {
  if (!tasks.value) return false;

  return countFinishedTasks(tasks.value) === tasks.value.length;
});

// New computed properties for scaling elements
const hasProgress = computed(
  () =>
    props.card.progress != null &&
    !props.card.hideProgress &&
    name.value !== "---"
);

const zoomClass = computed(() => {
  switch (props.zoomLevel) {
    case -1:
      return "zoom-down text-sm";
    case 0:
      return "zoom-normal";
    case 1:
      return "zoom-up text-xl";
    case 2:
      return "zoom-up-2x text-2xl";
    default:
      return "zoom-normal";
  }
});

const iconSizeClass = computed(() => {
  switch (props.zoomLevel) {
    case -1:
      return "size-3";
    case 0:
      return "size-4";
    case 1:
      return "size-5";
    case 2:
      return "size-8";
    default:
      return "size-4";
  }
});

const taskTextClass = computed(() => {
  switch (props.zoomLevel) {
    case -1:
      return "text-xs";
    case 0:
      return "text-sm";
    case 1:
      return "text-base";
    case 2:
      return "text-lg";
    default:
      return "text-sm";
  }
});

const cardBackgroundColor = computed(() => {
  if (!props.card.color) return "bg-elevation-2";

  return props.card.color;
});

const cardTextColor = computed(() => {
  if (cardBackgroundColor.value === "bg-elevation-2") {
    if (savedColors.value) {
      return getContrast(savedColors.value.elevation2);
    }
  }

  if (cardBackgroundColor.value.startsWith("#")) {
    return getContrast(cardBackgroundColor.value);
  }

  return "text-gray-50";
});

const cardTextColorDim = computed(() => {
  if (cardBackgroundColor.value === "bg-elevation-2") {
    if (savedColors.value) {
      if (getContrast(savedColors.value.elevation2) === "text-gray-50") {
        return "text-gray-300";
      }
      return "text-gray-700";
    }
  }

  if (cardBackgroundColor.value.startsWith("#")) {
    if (getContrast(cardBackgroundColor.value) === "text-gray-50") {
      return "text-gray-300";
    }
    return "text-gray-700";
  }

  return "text-gray-300";
});

const contextMenuClass = computed(() => {
  let contextMenuClasses =
    "bg-primary-darker border-elevation-1 z-[99999] min-w-[100px] rounded-md border p-[5px] shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] outline-none will-change-[opacity,transform]";

  if (globalSettingsStore.animationsEnabled) {
    contextMenuClasses +=
      " data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade";
  }

  return contextMenuClasses;
});

const getFormattedDueDate = computed(() => {
  if (!dueDate.value) return "";

  //relative countdown showing in 2 days in 2 hours etc
  if (isDueDateRelative.value) {
    const now = new Date();
    const dueDateTimestamp = new Date(dueDate.value).getTime();
    const timeDifference = dueDateTimestamp - now.getTime();

    if (timeDifference <= 0) {
      const secondsPast = Math.floor(-timeDifference / 1000);
      const minutesPast = Math.floor(secondsPast / 60);
      const hoursPast = Math.floor(minutesPast / 60);
      const daysPast =
        hoursPast % 24 > 12
          ? Math.ceil(hoursPast / 24)
          : Math.floor(hoursPast / 24);

      const seconds = secondsPast % 60;
      const minutes = minutesPast % 60;
      const hours = hoursPast % 24;
      const days = daysPast;

      const daysAgo = days > 0 ? `${days} day${days > 1 ? "s" : ""} ago` : "";
      const hoursAgo = hours > 0 ? `${hours}h ago` : "";
      const minutesAgo =
        minutes > 0 ? `${minutes}min${minutes > 1 ? "s" : ""} ago` : "";
      const secondsAgo = seconds > 0 ? `${seconds}s ago` : "";

      return daysAgo || hoursAgo || minutesAgo || secondsAgo;
    }

    const seconds = Math.floor(timeDifference / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days =
      hours % 24 > 12 ? Math.ceil(hours / 24) : Math.floor(hours / 24);

    if (days > 0) {
      return `in ${days} day${days > 1 ? "s" : ""}`;
    } else if (hours > 0) {
      return `in ${hours}h`;
    } else if (minutes > 0) {
      return `in ${minutes}min${minutes > 1 ? "s" : ""}`;
    } else {
      return `in ${seconds}s}`;
    }
  }

  const jsLocaleIdentifier = locale.value.replace("_", "-")
  return new Date(dueDate.value).toLocaleDateString(jsLocaleIdentifier);
});

const dueDateOverdue = computed(() => {
  if (!dueDate.value) return false;

  const now = new Date();
  const dueDateTimestamp = new Date(dueDate.value).getTime();
  const timeDifference = dueDateTimestamp - now.getTime();

  if (timeDifference <= 0) return true;

  return false;
});

const deleteCardWithConfirmation = (id: string | undefined) => {
  /*
    TODO: rewrite this, we are passing a ref through an emit which works for this usecase of DOM manipulation but might break reactivity
    need to figure out a better way to handle this, especially because we go back and forth between the card component and the parent
    (how this works at the moment: click x -> emit removeCardWithConfirmation -> parent component opens confirmation modal and checks if we actually want the deletion -> if yes, manipulate the DOM of the card component and then delete the card)
  */

  if (id) {
    // eslint-disable-next-line vue/no-ref-as-operand
    emit("removeCardWithConfirmation", id, cardRef);
  }
};

const enableCardEditMode = () => {
  emit("disableDragging");

  cardNameEditMode.value = true;

  if (cardNameText.value == null) return;

  const textAreaHeight = `height: ${cardNameText.value.scrollHeight}px`;

  nextTick(() => {
    if (cardNameInput.value == null) return;
    cardNameInput.value.setAttribute("style", textAreaHeight);
  });
};

const updateCardName = () => {
  if (name.value == null || !/\S/.test(name.value)) {
    name.value = props.card.name;
    cardNameEditMode.value = false;
    return;
  }

  // TODO: clean up logic and just pass card as prop; fix reactivity issues!
  emit("setCardName", props.card?.id, name.value);
  cardNameEditMode.value = false;
  emit("enableDragging");
};
</script>

<style scoped>
.file-row {
  scrollbar-width: none;
}

.file-row::-webkit-scrollbar {
  display: none;
}

.attachment-preview-enter-active,
.attachment-preview-leave-active {
  transition: opacity 150ms ease-out, transform 150ms ease-out;
}

.attachment-preview-enter-from,
.attachment-preview-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.9);
}

.kanban-card {
  transition-duration: 550ms;
  transition-timing-function: ease-out;
  transition-property: opacity, text-decoration;
  opacity: 100%;
}

.kanban-card.card-hidden {
  opacity: 0%;
  text-decoration: line-through;
}

.separator-card {
  margin-bottom: 0 !important;
  gap: 0.25rem !important;
}

/* Zoom level classes for scaling */
.zoom-down {
  padding: 0.5rem !important;
  margin-bottom: 0.45rem !important;
  gap: 0.25rem !important;
}

.zoom-normal {
  padding: 0.75rem !important;
  margin-bottom: 0.1rem !important;
  gap: 0.25rem !important;
}

.zoom-up {
  padding: 1rem !important;
  margin-bottom: 1rem !important;
  gap: 0.375rem !important;
}

.zoom-up-2x {
  padding: 1.25rem !important;
  margin-bottom: 1.25rem !important;
  gap: 0.5rem !important;
}
</style>
