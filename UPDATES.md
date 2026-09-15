# Recent Updates — State Management, Theme, & UMB Branding

## ✅ What's New

### 1. Zustand State Management
- Added `zustand` for global state management
- `notificationStore.ts` — Centralized toast/notification store
- Replaces Context-based toast state with proper store
- Toast queue support (multiple toasts at once)
- Better performance & separation of concerns

### 2. Theme Context & Dark Mode
- `themeContext.tsx` — Light/dark mode toggle
- Persists preference to localStorage
- Respects system preference on first load
- Full dark mode styling across all components
- Theme toggle button in top-right header

### 3. UMB Brand Colors
Updated `tailwind.config.js` with:
- Primary: `#F4A623` (UMB Gold/Yellow)
- Semantic colors: success, warning, error, info
- Dark mode color palette
- All UI components updated to support dark mode

### 4. Fixed Issues
- **Notifications page blank error** — Fixed "destroy is not a function"
  - Proper async/await error handling
  - Better loading state
  - Empty state message
- **Multiple toasts** — Can now stack & dismiss individually
- **Dark mode throughout** — All components now support light/dark

## 📦 Installation

After extracting the zip:

```bash
cd frontend
npm install  # Includes zustand@^4.4.7
npm run dev
```

## 🎨 Using the Theme

```typescript
import { useTheme } from "@/state/themeContext";

function MyComponent() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button onClick={toggleTheme}>
      Switch to {theme === "light" ? "dark" : "light"} mode
    </button>
  );
}
```

## 📢 Using Notifications

```typescript
import { useFlash } from "@/state/toastContext";

function MyComponent() {
  const flash = useFlash();
  
  return (
    <button onClick={() => flash("Success!", "success")}>
      Show Toast
    </button>
  );
}
```

Types: `"success"` | `"error"` | `"info"`

## 🎯 Zustand Store Direct Access

```typescript
import { useNotificationStore } from "@/state/notificationStore";

function MyComponent() {
  const { toasts, addToast, removeToast } = useNotificationStore();
  
  // Use independently of Context
}
```

## 🌈 UMB Colors in Code

```typescript
// Primary brand color (gold/yellow)
className="bg-brand-500 text-white"  // #F4A623

// Light/dark variants
className="bg-brand-100 dark:bg-brand-900"  // #fffbeb / dark

// Semantic colors
className="text-success"  // #10b981
className="text-warning"  // #f59e0b
className="text-error"    // #ef4444
```

## 🌓 Dark Mode Classes

Use Tailwind's `dark:` prefix:

```html
<!-- Automatically applies in dark mode when class="dark" on html -->
<div className="bg-white dark:bg-slate-800">
  <p className="text-slate-700 dark:text-slate-300">Content</p>
</div>
```

## 📝 Component Updates

All components now have dark mode support:
- ✅ Layout (sidebar & header with theme toggle)
- ✅ Modal
- ✅ Cards
- ✅ Form inputs
- ✅ Buttons
- ✅ Status pills
- ✅ Tables
- ✅ Toasts (all 3 types)

## 🔧 Configuration

### theme.ts
Located at `src/state/themeContext.tsx`
- Reads from localStorage: `"theme"` key
- Falls back to system preference
- Applies `class="dark"` to `<html>` element

### tailwind.config.js
- `darkMode: "class"` enabled
- UMB colors configured
- All Tailwind utilities support `dark:` prefix

### styles/index.css
- Dark mode base styles
- Dark mode component variants
- Smooth transitions

## 🚀 Next Steps

1. **Test the theme toggle** — Click moon/sun icon in top-right
2. **Check notifications** — Try creating an action (triggers toast)
3. **Verify dark mode** — All pages should be readable
4. **Customize colors** — Update `tailwind.config.js` if needed
5. **Add more stores** — Use Zustand pattern for other global state

## 📊 Before & After

**Before:**
- Toast state in Context only
- No dark mode support
- Blue brand colors
- "destroy is not a function" error on notifications page

**After:**
- Toast state in Zustand store
- Full dark/light mode with toggle
- UMB gold (#F4A623) as primary
- Notifications page fixed & fully functional
- Dark mode throughout all pages

## ✨ Benefits

1. **Better State Management**
   - Zustand is lighter than Context for this use case
   - Easier to scale
   - Cleaner component code

2. **User Preference**
   - Respects OS dark mode preference
   - Remembers choice in localStorage
   - One-click toggle

3. **Brand Alignment**
   - Uses UMB actual colors
   - Professional appearance
   - Accessible color contrast

4. **Reliability**
   - Fixed notifications bug
   - Proper error handling
   - Better loading states

## 📚 Further Reading

- Zustand docs: https://github.com/pmndrs/zustand
- Tailwind dark mode: https://tailwindcss.com/docs/dark-mode
- React hooks: https://react.dev/reference/react/hooks

---

**Need to revert?** All changes are backward compatible. Just:
1. Remove `zustand` from package.json
2. Revert `toastContext.tsx` to previous version
3. Remove `themeContext.tsx`
4. Remove theme toggle from Layout.tsx

But we recommend keeping these improvements! 🎉
