# Contributing to ngx-api-forms

We love pull requests! Here's how to contribute.

## Development Setup

```bash
# Clone the repo
git clone https://github.com/MikhaelGerbet/ngx-api-forms.git
cd ngx-api-forms

# Install dependencies
npm install

# Start development (library in watch mode + demo app)
npm run dev
```

## Project Structure

```
projects/
  ngx-api-forms/     # The library
    src/
      lib/
        form-bridge/   # Core FormBridge class
        presets/        # Backend error presets
        directives/    # Angular directives
        services/      # Injectable service
        models/        # TypeScript interfaces
        utils/         # Standalone utility functions
  demo/               # Demo application
```

## Running Tests

```bash
npm run test:ci
```

## Creating a New Preset

1. Create a file in `projects/ngx-api-forms/src/lib/presets/`
2. Implement the `ErrorPreset` interface
3. Add tests in `presets.spec.ts`
4. Export from `public-api.ts`

## Pull Request Guidelines

- Write tests for any new functionality
- Update the README if adding public API
- Keep commits focused and atomic
- Follow the existing code style
