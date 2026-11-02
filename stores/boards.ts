/* SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, qunm00

SPDX-License-Identifier: GPL-3.0-or-later

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
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { defineStore } from "pinia";
import { toRaw } from "vue";
import type { Board, Column, Card, Tag } from "@/types/kanban-types";
import { useTauriStore } from "@/stores/tauriStore";
import { generateUniqueID } from "@/utils/idGenerator";
import { PROJECT_EXTENSION, relativeInside, safeFolderName } from "@/utils/projectPaths";
import { appDataDir, join } from "@tauri-apps/api/path";
import { copyFile, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

type Pin = { id: string; title: string; pinIcon?: string; pinIconText?: string; pinColor?: string };

// pin appearance of project boards is kept inside their .kanri file
const PIN_FIELDS = ["pinIcon", "pinIconText", "pinColor"] as const;

// reference to a project board stored in its own .kanri file
export type ProjectRef = { id?: string; title?: string; path: string };

// last content written per project board, so only changed boards are written back
const writtenProjects: Record<string, string> = {};

// the project path is machine specific, so it is never part of the file
const serializeBoard = (board: Board) =>
  JSON.stringify({ ...toRaw(board), projectPath: undefined }, null, 2);

export const useBoardsStore = defineStore("boards", {
  state: () => ({
    boards: [] as Board[],
    pins: [] as Pin[],
    // project boards whose file could not be read, kept so the user can locate or remove them
    missingProjects: [] as ProjectRef[],
    initialized: false,
  }),
  getters: {
    boardById: (state) => (id: string) => state.boards.find(b => b.id === id) ?? null,
    isPinned: (state) => (id: string) => !!state.pins.find(p => p.id === id),
  },
  actions: {
    async init() {
      if (this.initialized) return;
      const tauri = useTauriStore().store;

      this.boards = (await tauri.get("boards")) || [];
      this.pins = (await tauri.get("pins")) || [];

      const refs = (await tauri.get<ProjectRef[]>("projects")) || [];
      for (const ref of refs) {
        if (!(await this._loadProject(ref))) this.missingProjects.push(ref);
      }
      this.initialized = true;

      this._propagateCreatedAtDates(); // add creation dates for old boards that don't have it
      this._setupAutoSave();
    },
    async forceReloadBoards() {
      const tauri = useTauriStore().store;
      const saved = ((await tauri.get<Board[]>("boards")) || []);
      this.boards = [...this.boards.filter(b => b.projectPath), ...saved];
    },
    async save() {
      const tauri = useTauriStore().store;
      try {
        const projects: ProjectRef[] = [
          ...this.boards
            .filter(b => b.projectPath)
            .map(b => ({ id: b.id, path: b.projectPath!, title: b.title })),
          ...this.missingProjects,
        ];

        await tauri.set("boards", this.boards.filter(b => !b.projectPath));
        await tauri.set("projects", projects);
        await tauri.set("pins", this.pins);
        await tauri.save();
        await this._writeProjects();
      } catch (error) {
        console.error("Failed to save boards/pins:", error);
        // Consider user notification or rollback strategy
        throw error;
      }
    },

    // Project boards (saved in their own folder)
    async _writeProject(board: Board) {
      const json = serializeBoard(board);
      await writeTextFile(board.projectPath!, json);
      writtenProjects[board.id] = json;
    },
    async _writeProjects() {
      for (const board of this.boards) {
        if (!board.projectPath) continue;
        if (writtenProjects[board.id] === serializeBoard(board)) continue;

        try {
          await this._writeProject(board);
        } catch (e) {
          console.error(`Failed to write project file for board ${board.title}`, e);
        }
      }
    },
    async _loadProject(ref: ProjectRef) {
      try {
        const board = JSON.parse(await readTextFile(ref.path)) as Board;
        if (!board || !board.id || !Array.isArray(board.columns)) {
          throw new Error("Not a Kanri project file");
        }

        // a copy of an already opened project would otherwise overwrite it
        const clash = this.boards.some(b => b.id === board.id);
        if (clash) board.id = generateUniqueID();

        board.projectPath = ref.path;
        if (!clash) writtenProjects[board.id] = serializeBoard(board);
        this.boards.push(board);

        // the project file is the source of truth for how its pin looks
        const pin = this.pins.find(p => p.id === board.id);
        if (pin) {
          for (const field of PIN_FIELDS) pin[field] = board[field];
        }
        return board.id;
      } catch (e) {
        console.warn(`Could not load project ${ref.path}`, e);
        return null;
      }
    },
    // creates <parentDir>/<name>/<name>.kanri plus an attachments folder
    async createProjectBoard(board: Board, parentDir: string) {
      const name = safeFolderName(board.title);
      const dir = await join(parentDir, name);
      if (await exists(dir)) throw new Error("exists");

      await mkdir(await join(dir, "attachments"), { recursive: true });
      board.projectPath = await join(dir, `${name}.${PROJECT_EXTENSION}`);

      this.upsertBoard(board);
      await this._writeProject(this.boardById(board.id)!);
    },
    async openProject(path: string) {
      const existing = this.boards.find(b => b.projectPath?.toLowerCase() === path.toLowerCase());
      if (existing) return existing.id;

      const id = await this._loadProject({ path });
      if (!id) throw new Error("invalid");

      this.missingProjects = this.missingProjects.filter(p => p.path.toLowerCase() !== path.toLowerCase());
      return id;
    },
    async locateProject(oldPath: string, newPath: string) {
      const missing = this.missingProjects.find(p => p.path === oldPath);
      const id = await this.openProject(newPath);

      this.missingProjects = this.missingProjects.filter(p => p !== missing);
      // keep pins working when the file was given a new id
      if (missing?.id && missing.id !== id) {
        const pin = this.pins.find(p => p.id === missing.id);
        if (pin) pin.id = id;
      }
    },
    removeMissingProject(path: string) {
      const missing = this.missingProjects.find(p => p.path === path);
      this.missingProjects = this.missingProjects.filter(p => p.path !== path);
      if (missing?.id) this.pins = this.pins.filter(p => p.id !== missing.id);
    },
    // moves a board stored in the app data into <parentDir>/<name>/ and copies its attachments along
    async saveBoardToProject(id: string, parentDir: string) {
      const index = this.boards.findIndex(b => b.id === id);
      const board = this.boards[index];
      if (!board || board.projectPath) return;

      const name = safeFolderName(board.title);
      const dir = await join(parentDir, name);
      if (await exists(dir)) throw new Error("exists");

      const attachmentsDir = await join(dir, "attachments");
      await mkdir(attachmentsDir, { recursive: true });
      const legacyDir = await join(await appDataDir(), "attachments");

      const copy: Board = JSON.parse(JSON.stringify(board));
      for (const column of copy.columns) {
        for (const card of column.cards) {
          for (const attachment of card.attachments ?? []) {
            if (attachment.directory) continue;

            // copied files, and links that point into the app's own attachments folder, become relative
            const stored = attachment.path ? relativeInside(legacyDir, attachment.path) : attachment.file;
            if (!stored) continue;

            try {
              await copyFile(await join(legacyDir, stored), await join(attachmentsDir, stored));
              attachment.file = stored;
              delete attachment.path;
            } catch (e) {
              console.warn("Could not copy attachment into project", e);
            }
          }
        }
      }

      copy.projectPath = await join(dir, `${name}.${PROJECT_EXTENSION}`);
      await writeTextFile(copy.projectPath, serializeBoard(copy));
      writtenProjects[copy.id] = serializeBoard(copy);
      this.boards[index] = copy;
    },

    // Board CRUD
    upsertBoard(board: Board) {
      const i = this.boards.findIndex(b => b.id === board.id);
      board.lastEdited = new Date();

      if (i === -1) {
        if (!board.id) {
          board.id = generateUniqueID();
        }
        if (!board.createdAt) {
          board.createdAt = new Date();
        }
        this.boards.push(board);
        return;
      }

      this.boards[i] = board;
    },
    removeBoard(id: string) {
      this.boards = this.boards.filter(b => b.id !== id);
      this.pins = this.pins.filter(p => p.id !== id);
    },
    duplicateBoard(id: string) {
      const b = this.boardById(id);
      if (!b) return;
      // a copy would share the original's project file and attachments
      if (b.projectPath) return;
      
      const copy: Board = JSON.parse(JSON.stringify(b));
      copy.id = generateUniqueID();
      copy.title = `${copy.title} (duplicate)`;
      copy.lastEdited = new Date();
      copy.createdAt = new Date();
      this.boards.push(copy);
    },
    renameBoard(id: string, title: string) {
      const b = this.boardById(id);
      if (!b) return;

      b.title = title;
      // also update pin title
      const pin = this.pins.find(p => p.id === id);
      if (pin) {
        pin.title = title;
      }

      b.lastEdited = new Date();
    },
    _propagateCreatedAtDates() {
      const now = new Date();
      this.boards.forEach((board, index) => {
        if (!board.createdAt) {
          // Give missing boards slightly older dates based on their index to preserve initial creation order
          board.createdAt = new Date(now.getTime() - (this.boards.length - index) * 1000);
          console.log(`Added creation date for board ${board.title} (ID: ${board.id}). This should only happen once!`)
        }
      });
    },

    togglePin(id: string) {
      const b = this.boardById(id);
      if (!b) return;
      const i = this.pins.findIndex(p => p.id === id);

      if (i === -1) {
        // TODO: see what order this creates
        const pin: Pin = { id, title: b.title };
        if (b.projectPath) {
          for (const field of PIN_FIELDS) pin[field] = b[field];
        }
        this.pins.push(pin);
      } else {
        // Remove the pin
        this.pins = this.pins.filter(p => p.id !== id);
      }
    },
    updateBoardPin(id: string) {
      // simple update: board title only
      const b = this.boardById(id);
      if (!b) return;

      this.mutateBoardPin(id, (pin) => {
        pin.title = b.title;
      });
    },
    async mutateBoardPin(id: string, mut: (pin: Pin) => void) {
      const pin = this.pins.find(p => p.id === id);
      if (pin) {
        mut(pin);

        const board = this.boardById(id);
        if (board?.projectPath) {
          for (const field of PIN_FIELDS) board[field] = pin[field];
        }
      }
    },

    // Global Tags ops
    addGlobalTag(boardId: string, tag: Tag) {
      const b = this.boardById(boardId);
      if (!b) return;
      if (!b.globalTags) b.globalTags = [];

      // only add if it doesn't exist already
      if (b.globalTags.find(t => t.id === tag.id)) return;

      b.globalTags.push(tag);
      b.lastEdited = new Date();
    },
    removeGlobalTag(boardId: string, tagId: string) {
      const b = this.boardById(boardId);
      if (!b) return;

      // Remove from globalTags list
      if (b.globalTags) {
        b.globalTags = b.globalTags.filter(t => t.id !== tagId);
      }

      // Remove references from all cards on this board
      for (const col of b.columns) {
        for (const card of col.cards) {
          if (!card.tags || card.tags.length === 0) continue;
          card.tags = card.tags.filter(t => t && t.id !== tagId);
        }
      }

      b.lastEdited = new Date();
    },
    setGlobalTagColor(boardId: string, tagId: string, color: string) {
      const b = this.boardById(boardId);
      if (!b || !b.globalTags) return;
      const tag = b.globalTags.find(t => t.id === tagId);
      if (!tag) return;

      const textColor = getContrast(color) === "text-gray-50" ? "#f4f4f5" : "#1e293b";
      tag.style = `background-color: ${color}; color: ${textColor}`;
      tag.color = color;

      // Propagate changes to all cards using this tag
      this._propagateGlobalTag(boardId, tag);
      b.lastEdited = new Date();
    },
    updateGlobalTagName(boardId: string, tagId: string, newName: string) {
      const b = this.boardById(boardId);
      if (!b || !b.globalTags) return;
      const tag = b.globalTags.find(t => t.id === tagId);
      if (!tag) return;

      tag.text = newName;

      // Propagate changes to all cards using this tag
      this._propagateGlobalTag(boardId, tag);
      b.lastEdited = new Date();
    },

     // Update all cards that reference the global tag (mutate in place)
    _propagateGlobalTag(boardId: string, updated: Tag) {
      const b = this.boardById(boardId);
      if (!b) return;

      for (const col of b.columns) {
        for (const card of col.cards) {
          if (!card.tags?.length) continue;

          for (let i = 0; i < card.tags.length; i++) {
            const match = card.tags[i];
            if (!match) continue;
            if (match.id !== updated.id) continue;

            // Update element, modify all properties except id
            card.tags[i] = {
              ...match,
              text: updated.text,
              color: updated.color,
              style: updated.style,
            };
          }
        }
      }
    },

    // Column ops
    addColumn(boardId: string, title = "New Column") {
      const b = this.boardById(boardId);
      if (!b) return;
      b.columns.push({ id: generateUniqueID(), title, cards: [] });
      b.lastEdited = new Date();
    },
    removeColumn(boardId: string, columnId: string) {
      const b = this.boardById(boardId);
      if (!b) return;
      b.columns = b.columns.filter(c => c.id !== columnId);
      b.lastEdited = new Date();
    },
    reorderColumns(boardId: string, nextColumns: Column[]) {
      const b = this.boardById(boardId);
      if (!b) return;
      b.columns = nextColumns;
      b.lastEdited = new Date();
    },
    setColumnTitle(boardId: string, columnId: string, title: string) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;
      
      col.title = title;
      b.lastEdited = new Date();
    },
    setColumnWidth(boardId: string, columnId: string, width?: number) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;

      if (width === undefined) {
        delete col.width;
      } else {
        col.width = Math.round(Math.min(Math.max(width, 160), 600));
      }
      b.lastEdited = new Date();
    },
    setColumnCompactProgress(boardId: string, columnId: string, compact: boolean) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;

      col.compactProgress = compact;
      b.lastEdited = new Date();
    },
    setColumnAutoComplete(boardId: string, columnId: string, enabled: boolean) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;

      col.autoComplete = enabled;
      b.lastEdited = new Date();
    },
    updateColumn(boardId: string, column: Column) {
      const b = this.boardById(boardId);
      if (!b) return;
      const i = b.columns.findIndex(c => c.id === column.id);
      if (i !== -1) b.columns[i] = column;
      b.lastEdited = new Date();
    },

    // Card ops
    createCard(boardId: string, columnId: string, card: Card, addToTop?: boolean) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;

      if (addToTop) {
        col.cards.unshift(card);
      } else {
        col.cards.push(card);
      }
      b.lastEdited = new Date();
    },
    duplicateCard(
      boardId: string,
      columnId: string,
      cardId: string,
      storedPaths: Record<string, string> = {}
    ) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;
      const card = col.cards.find(c => c.id === cardId);
      if (!card) return;

      // structuredClone throws on Vue reactive proxies, so work from the raw object
      const raw = toRaw(card);
      let copy: Card;
      try {
        copy = structuredClone(raw);
      } catch {
        copy = JSON.parse(JSON.stringify(raw)) as Card;
        if (raw.dueDate) copy.dueDate = new Date(raw.dueDate);
      }

      copy.id = generateUniqueID();
      copy.attachments = copy.attachments?.map((a) => ({
        ...a,
        id: generateUniqueID(),
        path: a.path ?? storedPaths[a.id],
      }));
      copy.name = `${copy.name} (copy)`;
      col.cards.push(copy);
      b.lastEdited = new Date();
    },
    deleteCard(boardId: string, columnId: string, cardId: string) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;

      col.cards = col.cards.filter(c => c.id !== cardId);
      b.lastEdited = new Date();
    },
    deleteAllColumnCards(boardId: string, columnId: string) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;

      col.cards = [];
      b.lastEdited = new Date();
    },
    mutateCard(boardId: string, columnId: string, cardId: string, mut: (c: Card) => void) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;
      const card = col.cards.find(c => c.id === cardId);
      if (!card) return;
      mut(card);
      b.lastEdited = new Date();
    },
    reorderCards(boardId: string, columnId: string, nextCards: Card[]) {
      const b = this.boardById(boardId);
      if (!b) return;
      const col = b.columns.find(c => c.id === columnId);
      if (!col) return;
      col.cards = nextCards;
      b.lastEdited = new Date();
    },
    moveCard(sourceBoardId: string, targetBoardId: string, sourceColumnId: string, targetColumnId: string, cardId: string) {
      if (sourceColumnId === targetColumnId) return;

      const sourceBoard = this.boardById(sourceBoardId);
      const targetBoard = this.boardById(targetBoardId);
      if (!sourceBoard || !targetBoard) return;

      const sourceCol = sourceBoard.columns.find(c => c.id === sourceColumnId);
      const targetCol = targetBoard.columns.find(c => c.id === targetColumnId);
      if (!sourceCol || !targetCol) return;

      const cardIndex = sourceCol.cards.findIndex(c => c.id === cardId);

      const [card] = sourceCol.cards.splice(cardIndex, 1);
      if (card === undefined) return;
      if (targetCol.autoComplete) card.done = true;
      targetCol.cards.push(card);
      targetBoard.lastEdited = new Date();
      sourceBoard.lastEdited = new Date();
    },

    // Debounced auto-save of board properties
    // When testing in the future, we should check if Tauri store is in sync with state
    _setupAutoSave() {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const schedule = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          console.log("Auto-saving boards...");
          this.save().catch((err) => {
            console.error("Auto-save failed:", err);
          });
          timeout = null;
        }, 100);
      };

      this.$subscribe(schedule, { detached: true, deep: true});
    },
  },
});