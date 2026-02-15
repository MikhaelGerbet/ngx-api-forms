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

    // 2. Try to add interceptor to app.config.ts
    const appConfigPath = "src/app/app.config.ts";
    if (tree.exists(appConfigPath)) {
      const content = tree.read(appConfigPath).toString("utf-8");
      if (!content.includes("apiErrorInterceptor")) {
        context.logger.info(
          "\nTo enable automatic error handling, add the interceptor to your app.config.ts:\n\n" +
          "  import { provideHttpClient, withInterceptors } from '@angular/common/http';\n" +
          "  import { apiErrorInterceptor } from 'ngx-api-forms';\n\n" +
          "  provideHttpClient(withInterceptors([apiErrorInterceptor()]))\n"
        );
      }
    }

    return tree;
  };
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
