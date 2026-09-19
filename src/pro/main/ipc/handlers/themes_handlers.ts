import { createLoggedHandler } from "../../../../ipc/handlers/safe_handle";
import log from "electron-log";
import path from "path";
import os from "os";
import fs from "fs";
import { writeFile, unlink, mkdir } from "fs/promises";
import { themesData, type Theme } from "../../../../shared/themes";
import { db } from "../../../../db";
import { apps, customThemes } from "../../../../db/schema";
import { eq, sql } from "drizzle-orm";
import type {
  SetAppThemeParams,
  GetAppThemeParams,
  CustomTheme,
  CreateCustomThemeParams,
  UpdateCustomThemeParams,
  DeleteCustomThemeParams,
  SaveThemeImageParams,
  SaveThemeImageResult,
  CleanupThemeImagesParams,
  ThemeGenerationModelOption,
} from "@/ipc/types";
import { getThemeGenerationModelOptions } from "@/ipc/shared/remote_language_model_catalog";
import { DyadError, DyadErrorKind } from "@/errors/dyad_error";

const logger = log.scope("themes_handlers");
const handle = createLoggedHandler(logger);

// Directory for storing temporary theme images
const THEME_IMAGES_TEMP_DIR = path.join(os.tmpdir(), "dyad-theme-images");

// Ensure temp directory exists
if (!fs.existsSync(THEME_IMAGES_TEMP_DIR)) {
  fs.mkdirSync(THEME_IMAGES_TEMP_DIR, { recursive: true });
}

export function registerThemesHandlers() {
  // Get built-in themes
  handle("get-themes", async (): Promise<Theme[]> => {
    return themesData;
  });

  // Set app theme (built-in or custom theme ID)
  handle(
    "set-app-theme",
    async (_, params: SetAppThemeParams): Promise<void> => {
      const { appId, themeId } = params;
      // Use raw SQL to properly set NULL when themeId is null (representing "no theme")
      if (!themeId) {
        await db
          .update(apps)
          .set({ themeId: sql`NULL` })
          .where(eq(apps.id, appId));
      } else {
        await db.update(apps).set({ themeId }).where(eq(apps.id, appId));
      }
    },
  );

  // Get app theme
  handle(
    "get-app-theme",
    async (_, params: GetAppThemeParams): Promise<string | null> => {
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, params.appId),
        columns: { themeId: true },
      });
      return app?.themeId ?? null;
    },
  );

  // Get all custom themes
  handle("get-custom-themes", async (): Promise<CustomTheme[]> => {
    const themes = await db.query.customThemes.findMany({
      orderBy: (themes, { desc }) => [desc(themes.createdAt)],
    });

    return themes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      prompt: t.prompt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  });

  handle(
    "get-theme-generation-model-options",
    async (): Promise<ThemeGenerationModelOption[]> => {
      return getThemeGenerationModelOptions();
    },
  );

  // Create custom theme
  handle(
    "create-custom-theme",
    async (_, params: CreateCustomThemeParams): Promise<CustomTheme> => {
      // Validate and sanitize inputs
      const trimmedName = params.name.trim();
      const trimmedDescription = params.description?.trim();
      const trimmedPrompt = params.prompt.trim();

      // Validate name
      if (!trimmedName) {
        throw new DyadError("Theme name is required", DyadErrorKind.Validation);
      }
      if (trimmedName.length > 100) {
        throw new DyadError(
          "Theme name must be less than 100 characters",
          DyadErrorKind.Validation,
        );
      }

      // Validate description
      if (trimmedDescription && trimmedDescription.length > 500) {
        throw new DyadError(
          "Theme description must be less than 500 characters",
          DyadErrorKind.Validation,
        );
      }

      // Validate prompt
      if (!trimmedPrompt) {
        throw new DyadError(
          "Theme prompt is required",
          DyadErrorKind.Validation,
        );
      }
      if (trimmedPrompt.length > 50000) {
        throw new DyadError(
          "Theme prompt must be less than 50,000 characters",
          DyadErrorKind.Validation,
        );
      }

      // Check for duplicate theme name (case-insensitive)
      const existingTheme = await db.query.customThemes.findFirst({
        where: sql`LOWER(${customThemes.name}) = LOWER(${trimmedName})`,
      });

      if (existingTheme) {
        throw new Error(
          `A theme named "${trimmedName}" already exists. Please choose a different name.`,
        );
      }

      const result = await db
        .insert(customThemes)
        .values({
          name: trimmedName,
          description: trimmedDescription || null,
          prompt: trimmedPrompt,
        })
        .returning();

      const theme = result[0];
      return {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        prompt: theme.prompt,
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
      };
    },
  );

  // Update custom theme
  handle(
    "update-custom-theme",
    async (_, params: UpdateCustomThemeParams): Promise<CustomTheme> => {
      const updateData: Partial<{
        name: string;
        description: string | null;
        prompt: string;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };

      // Get the current theme to verify it exists
      const currentTheme = await db.query.customThemes.findFirst({
        where: eq(customThemes.id, params.id),
      });

      if (!currentTheme) {
        throw new DyadError("Theme not found", DyadErrorKind.NotFound);
      }

      // Validate and sanitize name if provided
      if (params.name !== undefined) {
        const trimmedName = params.name.trim();
        if (!trimmedName) {
          throw new DyadError(
            "Theme name is required",
            DyadErrorKind.Validation,
          );
        }
        if (trimmedName.length > 100) {
          throw new DyadError(
            "Theme name must be less than 100 characters",
            DyadErrorKind.Validation,
          );
        }

        // Check for duplicate theme name (case-insensitive), excluding current theme
        const existingTheme = await db.query.customThemes.findFirst({
          where: sql`LOWER(${customThemes.name}) = LOWER(${trimmedName}) AND ${customThemes.id} != ${params.id}`,
        });

        if (existingTheme) {
          throw new Error(
            `A theme named "${trimmedName}" already exists. Please choose a different name.`,
          );
        }

        updateData.name = trimmedName;
      }

      // Validate and sanitize description if provided
      if (params.description !== undefined) {
        const trimmedDescription = params.description.trim();
        if (trimmedDescription.length > 500) {
          throw new DyadError(
            "Theme description must be less than 500 characters",
            DyadErrorKind.Validation,
          );
        }
        updateData.description = trimmedDescription || null;
      }

      // Validate and sanitize prompt if provided
      if (params.prompt !== undefined) {
        const trimmedPrompt = params.prompt.trim();
        if (!trimmedPrompt) {
          throw new DyadError(
            "Theme prompt is required",
            DyadErrorKind.Validation,
          );
        }
        if (trimmedPrompt.length > 50000) {
          throw new DyadError(
            "Theme prompt must be less than 50,000 characters",
            DyadErrorKind.Validation,
          );
        }
        updateData.prompt = trimmedPrompt;
      }

      const result = await db
        .update(customThemes)
        .set(updateData)
        .where(eq(customThemes.id, params.id))
        .returning();

      const theme = result[0];
      if (!theme) {
        throw new DyadError("Theme not found", DyadErrorKind.NotFound);
      }

      return {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        prompt: theme.prompt,
        createdAt: theme.createdAt,
        updatedAt: theme.updatedAt,
      };
    },
  );

  // Delete custom theme
  handle(
    "delete-custom-theme",
    async (_, params: DeleteCustomThemeParams): Promise<void> => {
      await db.delete(customThemes).where(eq(customThemes.id, params.id));
    },
  );

  // Save theme image to temp directory
  handle(
    "save-theme-image",
    async (_, params: SaveThemeImageParams): Promise<SaveThemeImageResult> => {
      const { data, filename } = params;

      // Validate base64 data
      if (!data || typeof data !== "string") {
        throw new DyadError("Invalid image data", DyadErrorKind.Validation);
      }

      // Validate and extract extension
      const ext = path.extname(filename).toLowerCase();
      const validExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
      if (!validExtensions.includes(ext)) {
        throw new Error(
          `Invalid image extension: ${ext}. Supported: ${validExtensions.join(", ")}`,
        );
      }

      // Generate unique filename
      const uniqueFilename = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}${ext}`;
      const filePath = path.join(THEME_IMAGES_TEMP_DIR, uniqueFilename);

      // Validate size (base64 to bytes approximation)
      const sizeInBytes = (data.length * 3) / 4;
      if (sizeInBytes > 10 * 1024 * 1024) {
        throw new DyadError(
          "Image size exceeds 10MB limit",
          DyadErrorKind.Validation,
        );
      }

      // Ensure temp directory exists
      await mkdir(THEME_IMAGES_TEMP_DIR, { recursive: true });

      // Write file
      const buffer = Buffer.from(data, "base64");
      await writeFile(filePath, buffer);

      return { path: filePath };
    },
  );

  // Cleanup theme images from temp directory
  handle(
    "cleanup-theme-images",
    async (_, params: CleanupThemeImagesParams): Promise<void> => {
      const { paths } = params;

      for (const filePath of paths) {
        // Security: only delete files in our temp directory
        // Use path.resolve() to normalize and prevent path traversal attacks
        const normalizedPath = path.resolve(filePath);
        const normalizedTempDir = path.resolve(THEME_IMAGES_TEMP_DIR);
        if (!normalizedPath.startsWith(normalizedTempDir + path.sep)) {
          throw new Error(
            "Invalid path: cannot delete files outside temp directory",
          );
        }

        try {
          await unlink(filePath);
          logger.log(`Cleaned up theme image: ${filePath}`);
        } catch (error) {
          // File might already be deleted (ENOENT), that's okay
          // But other errors (permissions, etc.) should be reported
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw new DyadError(
              "Failed to cleanup temporary image file",
              DyadErrorKind.External,
            );
          }
        }
      }
    },
  );
}
