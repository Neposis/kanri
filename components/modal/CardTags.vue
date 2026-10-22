<!-- SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, gitoak -->
<!-- -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
Kanri is an offline Kanban board app made using Tauri and Nuxt.
Copyright (C) 2022-2026 trobonox <hello@trobo.dev>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. -->

<template>
  <Modal :click-outside-to-close="true" @closeModal="$emit('closeModal')">
    <template #content>
      <main class="h-[36rem] min-w-[32rem] max-w-3xl overflow-auto">
        <div class="flex flex-row items-start justify-between">
          <div class="flex flex-col gap-1">
            <h1 class="pointer-events-auto pr-5 text-2xl font-bold">
              {{ $t("modals.cardTags.title") }}
            </h1>
            <p class="text-dim-3 inline-block max-w-xl text-sm">
              {{ $t("modals.cardTags.description") }}
            </p>
          </div>
          <XMarkIcon
            class="text-accent-hover size-6 cursor-pointer"
            @click="$emit('closeModal')"
          />
        </div>
        <div class="mt-4 flex flex-col gap-4">
          <section id="bg-selection">
            <h2 class="mb-2 text-lg font-semibold">
              {{ $t("modals.cardTags.tagListTitle") }}
            </h2>
            <div class="flex flex-col gap-2">
              <KanbanTagEdit
                v-for="tag in tags"
                :key="tag.id"
                :tag="tag"
                @setTagColor="setTagColor"
                @removeTag="removeTag"
                @updateTagName="updateTagName"
              />
            </div>
            <form class="mt-3 flex flex-row items-center gap-2" @submit.prevent="submitNewTag">
              <input
                v-model="newTagName"
                type="text"
                class="bg-elevation-2 w-full rounded-md px-2 py-1 outline-none"
                :placeholder="$t('modals.cardTags.addTag')"
              />
              <button
                type="submit"
                class="bg-accent text-buttons flex shrink-0 flex-row items-center gap-1 rounded-md px-3 py-1 disabled:opacity-50"
                :disabled="!newTagName.trim()"
              >
                <PhPlus class="size-4" />
                {{ $t("modals.cardTags.addTag") }}
              </button>
            </form>
          </section>
        </div>
      </main>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { XMarkIcon } from "@heroicons/vue/24/solid";
import { PhPlus } from "@phosphor-icons/vue";
import type { Tag } from "@/types/kanban-types";

const emit = defineEmits([
  "closeModal",
  "setTagColor",
  "removeTag",
  "updateTagName",
  "addTag",
]);

const props = defineProps<{
  tags: Array<Tag>;
}>();

const newTagName = ref("");

const submitNewTag = () => {
  const text = newTagName.value.trim();
  if (!text) return;
  const exists = props.tags.some(
    (tag) => tag.text.toLowerCase() === text.toLowerCase()
  );
  if (!exists) emit("addTag", { id: generateUniqueID(), text });
  newTagName.value = "";
};

const setTagColor = (tagId: string, color: string | null) => {
  emit("setTagColor", tagId, color);
};

const removeTag = (tagId: string) => {
  emit("removeTag", tagId);
};

const updateTagName = (tagId: string, newName: string) => {
  emit("updateTagName", tagId, newName);
};
</script>
