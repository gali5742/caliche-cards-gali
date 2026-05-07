# Contributing to Caliche Cards

Thanks for your interest in contributing. This is a solo-built project that welcomes outside help — whether it's a bug fix, a new feature, or just improving the docs.

---

## Getting started locally

### Prerequisites

- Node.js 18+
- A MongoDB instance (local or [Atlas free tier](https://www.mongodb.com/atlas))

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/caliche-cards.git
cd caliche-cards
npm install
```

### 2. Set up environment variables

Create a `.env.local` file at the root:

```bash
# Required
MONGODB_URI="<your mongodb connection string>"
AUTH_SECRET="<long random string>"

# Optional
MONGODB_DB="caliche-cards"
GUEST_DEMO_USER_ID="<mongo objectid>"
GUEST_DEMO_USERNAME="test"

# Optional: admin tools for development
ADMIN_USER_ID="<your mongo objectid>"
ADMIN_USERNAME="<your username>"
NEXT_PUBLIC_ENABLE_DEV_PURGE="1"
```

Generate a secure `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Import any Anki `.apkg` file to start reviewing.

---

## How to open a pull request

1. **Create a branch** from `master` with a descriptive name:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes.** Keep commits focused — one logical change per commit.

3. **Push your branch** to your fork:
   ```bash
   git push origin feat/my-feature
   ```

4. **Open a PR** against `CalicheOrozco/caliche-cards` → `master`. Include:
   - What the change does and why
   - Steps to test it manually
   - Screenshots if it touches the UI

---

## Guidelines

- **No breaking changes to the SRS logic** without discussion first — the scheduler is the core of the app.
- **Test on mobile** if you touch the review UI. The app is primarily used on phones.
- **Keep it offline-first** — new features should work without a network connection where possible.
- **One PR per concern** — a bug fix and a refactor in the same PR are hard to review.

---

## Ideas for contributions

Looking for somewhere to start? Here are areas with room to grow:

- New question types or scheduler improvements
- Better deck browser and stats (e.g. heatmap, retention graph)
- Themes / light mode / dark mode improvements
- Sync backends beyond MongoDB
- Translations / i18n
- Performance improvements for large decks

If you have a feature idea or found a bug, [open an issue](https://github.com/CalicheOrozco/caliche-cards/issues) first so we can discuss it before you invest time building it.
