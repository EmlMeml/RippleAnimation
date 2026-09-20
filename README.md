# RippleAnimation

RippleAnimation is a React prototype for inspecting and revising narrative inconsistencies. It connects detected issues with the affected text passages through cards, highlights, context previews, markers, and animations.

## Requirements

- [Node.js 22](https://nodejs.org/) or newer
- npm, included with Node.js
- An internet connection for live AI analysis

## Run locally

1. Clone or download the repository and open a terminal in the project folder.
2. Install the dependencies:

   ```bash
   npm ci
   ```

3. Create a `.env.local` file with the following content:

   ```env
   VITE_BASE_PATH=/
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local address shown in the terminal, normally <http://localhost:5173/>.

The application sends analysis requests to the AI worker configured in `src/ai/api.ts`. No local AI model or API key is required for the current configuration.

## Optional study logging

Study-event logging uses Supabase. To enable it, add the following values to `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Without these values, the interface still runs, but study events are not uploaded to Supabase. See `.env.example` for all supported environment variables.

## Useful commands

```bash
npm run dev       # Start the development server
npm run test:run  # Run the test suite once
npm run lint      # Check the source code
npm run build     # Create a production build in dist/
npm run preview   # Preview the production build locally
```

For a local production preview, keep `VITE_BASE_PATH=/` in `.env.local`, then run `npm run build` followed by `npm run preview`.
