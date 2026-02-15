"use strict";

const schematics = require("@angular-devkit/schematics");
const tasks = require("@angular-devkit/schematics/tasks");

const PRESET_IMPORTS = {
  laravel: "laravelPreset",
  django: "djangoPreset",
  "class-validator": "classValidatorPreset",
  zod: "zodPreset",
};

const PRESET_CALLS = {
  laravel: "laravelPreset()",
  django: "djangoPreset()",
  "class-validator": "classValidatorPreset()",
  zod: "zodPreset()",
};

function ngAdd(options) {
  return (tree, context) => {
    context.addTask(new tasks.NodePackageInstallTask());

    const preset = options.preset || "laravel";
    const importName = PRESET_IMPORTS[preset] || "classValidatorPreset";
    const presetCall = PRESET_CALLS[preset] || "classValidatorPreset()";

    const exampleContent = buildExampleContent(importName, presetCall);
    const examplePath = "src/app/api-forms-example.component.ts";

    if (!tree.exists(examplePath)) {
      tree.create(examplePath, exampleContent);
      context.logger.info(
        "Created " + examplePath + " with " + preset + " preset."
      );
    } else {
      context.logger.warn(
        examplePath + " already exists. Skipping example generation."
      );
    }

    return tree;
  };
}

function buildExampleContent(importName, presetCall) {
  return (
    "import { Component, inject } from '@angular/core';\n" +
    "import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';\n" +
    "import { HttpClient } from '@angular/common/http';\n" +
    "import {\n" +
    "  provideFormBridge,\n" +
    "  " + importName + ",\n" +
    "  NgxFormErrorDirective,\n" +
    "} from 'ngx-api-forms';\n" +
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
    "    preset: " + presetCall + ",\n" +
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
