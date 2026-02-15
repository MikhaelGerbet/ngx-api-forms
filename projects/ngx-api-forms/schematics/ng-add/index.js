"use strict";

const schematics = require("@angular-devkit/schematics");
const tasks = require("@angular-devkit/schematics/tasks");

/**
 * Maps preset names to their import configuration.
 * class-validator lives in the primary entry point; all others are secondary.
 */
const PRESET_CONFIG = {
  "class-validator": {
    importName: "classValidatorPreset",
    importPath: "ngx-api-forms",
    call: "classValidatorPreset()",
  },
  laravel: {
    importName: "laravelPreset",
    importPath: "ngx-api-forms/laravel",
    call: "laravelPreset()",
  },
  django: {
    importName: "djangoPreset",
    importPath: "ngx-api-forms/django",
    call: "djangoPreset()",
  },
  zod: {
    importName: "zodPreset",
    importPath: "ngx-api-forms/zod",
    call: "zodPreset()",
  },
  "express-validator": {
    importName: "expressValidatorPreset",
    importPath: "ngx-api-forms/express-validator",
    call: "expressValidatorPreset()",
  },
  analog: {
    importName: "analogPreset",
    importPath: "ngx-api-forms/analog",
    call: "analogPreset()",
  },
};

function ngAdd(options) {
  return (tree, context) => {
    context.addTask(new tasks.NodePackageInstallTask());

    const preset = options.preset || "class-validator";
    const config = PRESET_CONFIG[preset] || PRESET_CONFIG["class-validator"];

    // 1. Create example component
    const examplePath = "src/app/api-forms-example.component.ts";
    if (!tree.exists(examplePath)) {
      tree.create(examplePath, buildExampleContent(config));
      context.logger.info(
        "Created " + examplePath + " with " + preset + " preset."
      );
    } else {
      context.logger.warn(
        examplePath + " already exists. Skipping example generation."
      );
    }

    // 2. Auto-inject interceptor into app.config.ts
    const appConfigPath = "src/app/app.config.ts";
    if (tree.exists(appConfigPath)) {
      const content = tree.read(appConfigPath).toString("utf-8");
      const updated = injectInterceptor(content);
      if (updated !== content) {
        tree.overwrite(appConfigPath, updated);
        context.logger.info(
          "Updated " + appConfigPath + ": added apiErrorInterceptor to HttpClient interceptors."
        );
      } else if (content.includes("apiErrorInterceptor")) {
        context.logger.info(
          appConfigPath + " already contains apiErrorInterceptor. Skipping."
        );
      } else {
        context.logger.warn(
          "Could not auto-inject interceptor into " + appConfigPath + ".\n" +
          "Add it manually:\n\n" +
          "  import { provideHttpClient, withInterceptors } from '@angular/common/http';\n" +
          "  import { apiErrorInterceptor } from 'ngx-api-forms';\n\n" +
          "  provideHttpClient(withInterceptors([apiErrorInterceptor()]))\n"
        );
      }
    } else {
      context.logger.warn(
        "Could not find " + appConfigPath + ". Add the interceptor manually:\n\n" +
        "  import { provideHttpClient, withInterceptors } from '@angular/common/http';\n" +
        "  import { apiErrorInterceptor } from 'ngx-api-forms';\n\n" +
        "  provideHttpClient(withInterceptors([apiErrorInterceptor()]))\n"
      );
    }

    return tree;
  };
}

/**
 * Attempts to inject `apiErrorInterceptor()` into an app.config.ts file.
 * Returns the modified content, or the original if injection was not possible.
 *
 * Handles three cases:
 * 1. `withInterceptors([...])` exists -> add apiErrorInterceptor() to the array
 * 2. `provideHttpClient(...)` exists without withInterceptors -> add withInterceptors
 * 3. Neither exists -> add provideHttpClient with interceptor to providers array
 */
function injectInterceptor(content) {
  // Already present
  if (content.includes("apiErrorInterceptor")) return content;

  let result = content;

  // Ensure apiErrorInterceptor import exists
  // Check if there's already an import from 'ngx-api-forms'
  const ngxImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]ngx-api-forms['"]/;
  const ngxImportMatch = result.match(ngxImportRegex);
  if (ngxImportMatch) {
    // Add to existing import (trim to avoid double spaces)
    const existingImports = ngxImportMatch[1].trim();
    result = result.replace(
      ngxImportMatch[0],
      "import { " + existingImports + ", apiErrorInterceptor } from 'ngx-api-forms'"
    );
  } else {
    // Add new import after last import line
    const lastImportIndex = result.lastIndexOf("import ");
    if (lastImportIndex !== -1) {
      const afterImport = result.substring(lastImportIndex);
      const semiIndex = afterImport.indexOf(";");
      if (semiIndex !== -1) {
        const importEnd = lastImportIndex + semiIndex + 1;
        result =
          result.substring(0, importEnd) +
          "\nimport { apiErrorInterceptor } from 'ngx-api-forms';" +
          result.substring(importEnd);
      }
    }
  }

  // Case 1: withInterceptors([...]) exists -> add to array
  const withInterceptorsRegex = /withInterceptors\s*\(\s*\[([^\]]*)\]/;
  const withInterceptorsMatch = result.match(withInterceptorsRegex);
  if (withInterceptorsMatch) {
    const existingInterceptors = withInterceptorsMatch[1].trim();
    const separator = existingInterceptors.length > 0 ? ", " : "";
    result = result.replace(
      withInterceptorsMatch[0],
      "withInterceptors([" + existingInterceptors + separator + "apiErrorInterceptor()]"
    );
    result = ensureHttpImport(result, "withInterceptors");
    return result;
  }

  // Case 2: provideHttpClient(...) exists without withInterceptors
  // Use balanced-paren scanner to handle nested calls like withFetch()
  const phcIndex = result.indexOf("provideHttpClient(");
  if (phcIndex !== -1) {
    const openParen = phcIndex + "provideHttpClient".length;
    let depth = 0;
    let closeParen = -1;
    for (let i = openParen; i < result.length; i++) {
      if (result[i] === "(") depth++;
      else if (result[i] === ")") {
        depth--;
        if (depth === 0) { closeParen = i; break; }
      }
    }
    if (closeParen !== -1) {
      const existingArgs = result.substring(openParen + 1, closeParen).trim();
      const separator = existingArgs.length > 0 ? ", " : "";
      result =
        result.substring(0, openParen + 1) +
        existingArgs + separator + "withInterceptors([apiErrorInterceptor()])" +
        result.substring(closeParen);
      result = ensureHttpImport(result, "provideHttpClient");
      result = ensureHttpImport(result, "withInterceptors");
      return result;
    }
  }

  // Case 3: No provideHttpClient -> add to providers array
  const providersRegex = /providers\s*:\s*\[/;
  const providersMatch = result.match(providersRegex);
  if (providersMatch) {
    result = result.replace(
      providersMatch[0],
      providersMatch[0] +
        "\n    provideHttpClient(withInterceptors([apiErrorInterceptor()])),"
    );
    result = ensureHttpImport(result, "provideHttpClient");
    result = ensureHttpImport(result, "withInterceptors");
    return result;
  }

  // Could not inject
  return content;
}

/**
 * Ensures a symbol is imported from '@angular/common/http'.
 * Only checks import statements, not usage in code.
 */
function ensureHttpImport(content, symbol) {
  const httpImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]@angular\/common\/http['"]/;
  const match = content.match(httpImportRegex);

  if (match) {
    // Already imported?
    if (match[1].includes(symbol)) return content;
    // Add to existing import
    return content.replace(
      match[0],
      "import { " + match[1].trim() + ", " + symbol + " } from '@angular/common/http'"
    );
  }

  // Add new import after last import
  const lastImportIndex = content.lastIndexOf("import ");
  if (lastImportIndex !== -1) {
    const afterImport = content.substring(lastImportIndex);
    const semiIndex = afterImport.indexOf(";");
    if (semiIndex !== -1) {
      const importEnd = lastImportIndex + semiIndex + 1;
      return (
        content.substring(0, importEnd) +
        "\nimport { " + symbol + " } from '@angular/common/http';" +
        content.substring(importEnd)
      );
    }
  }
  return content;
}

function buildExampleContent(config) {
  const presetImportLine =
    config.importPath === "ngx-api-forms"
      ? "import {\n" +
        "  provideFormBridge,\n" +
        "  " + config.importName + ",\n" +
        "  NgxFormErrorDirective,\n" +
        "} from 'ngx-api-forms';\n"
      : "import { provideFormBridge, NgxFormErrorDirective } from 'ngx-api-forms';\n" +
        "import { " + config.importName + " } from '" + config.importPath + "';\n";

  return (
    "import { Component, inject } from '@angular/core';\n" +
    "import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';\n" +
    "import { HttpClient } from '@angular/common/http';\n" +
    presetImportLine +
    "\n" +
    "@Component({\n" +
    "  selector: 'app-api-forms-example',\n" +
    "  standalone: true,\n" +
    "  imports: [ReactiveFormsModule, NgxFormErrorDirective],\n" +
    "  template: `\n" +
    "    <form [formGroup]=\"form\" (ngSubmit)=\"onSubmit()\">\n" +
    "      <label>\n" +
    "        Email\n" +
    "        <input formControlName=\"email\" />\n" +
    "        <span ngxFormError=\"email\" [form]=\"form\"></span>\n" +
    "      </label>\n" +
    "\n" +
    "      <label>\n" +
    "        Name\n" +
    "        <input formControlName=\"name\" />\n" +
    "        <span ngxFormError=\"name\" [form]=\"form\"></span>\n" +
    "      </label>\n" +
    "\n" +
    "      <button type=\"submit\">Save</button>\n" +
    "    </form>\n" +
    "  `,\n" +
    "})\n" +
    "export class ApiFormsExampleComponent {\n" +
    "  private http = inject(HttpClient);\n" +
    "  private fb = inject(FormBuilder);\n" +
    "\n" +
    "  form = this.fb.group({\n" +
    "    email: ['', [Validators.required, Validators.email]],\n" +
    "    name: ['', [Validators.required, Validators.minLength(3)]],\n" +
    "  });\n" +
    "\n" +
    "  bridge = provideFormBridge(this.form, {\n" +
    "    preset: " + config.call + ",\n" +
    "  });\n" +
    "\n" +
    "  onSubmit() {\n" +
    "    if (this.form.invalid) return;\n" +
    "\n" +
    "    this.http.post('/api/example', this.form.value).subscribe({\n" +
    "      next: () => console.log('Success'),\n" +
    "      error: (err) => this.bridge.applyApiErrors(err.error),\n" +
    "    });\n" +
    "  }\n" +
    "}\n"
  );
}

exports.ngAdd = ngAdd;
exports.injectInterceptor = injectInterceptor;
