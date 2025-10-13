# Sayori Proxy Design Guidelines

## Design Approach
**Hybrid Approach**: Following the user's specified pink and white color scheme with modern dashboard design principles. Drawing inspiration from Linear's clean interface patterns and Vercel's minimalist aesthetics, adapted for a developer-focused API proxy tool.

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Primary Pink: 330 85% 60% (vibrant pink for CTAs, active states)
- Primary Pink Hover: 330 85% 55%
- Secondary Pink: 330 70% 95% (soft pink backgrounds)
- Background White: 0 0% 100%
- Surface White: 0 0% 98%
- Text Primary: 0 0% 10%
- Text Secondary: 0 0% 45%
- Border: 0 0% 90%
- Success: 142 71% 45%
- Warning: 38 92% 50%
- Error: 0 84% 60%

**Dark Mode:**
- Primary Pink: 330 75% 65% (slightly lighter for contrast)
- Primary Pink Hover: 330 75% 70%
- Secondary Pink: 330 35% 15% (muted pink backgrounds)
- Background Dark: 0 0% 8%
- Surface Dark: 0 0% 12%
- Text Primary: 0 0% 95%
- Text Secondary: 0 0% 60%
- Border: 0 0% 20%
- Success: 142 60% 50%
- Warning: 38 80% 55%
- Error: 0 70% 65%

### B. Typography

**Font Families:**
- Primary: 'Inter' (body text, UI elements) - Google Fonts
- Monospace: 'JetBrains Mono' (API keys, model IDs, code) - Google Fonts

**Scale:**
- Hero/Display: text-5xl/text-6xl (48px/60px), font-bold
- Page Titles: text-3xl (30px), font-semibold
- Section Headers: text-2xl (24px), font-semibold
- Card Titles: text-lg (18px), font-medium
- Body Text: text-base (16px), font-normal
- Captions/Labels: text-sm (14px), font-medium
- Small Text: text-xs (12px), font-normal

### C. Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16, 20 (e.g., p-4, gap-6, mt-8)

**Container Strategy:**
- Main content: max-w-7xl mx-auto px-6
- Admin panels: max-w-6xl mx-auto px-6
- Forms/Cards: max-w-2xl for focused content
- Full-width: Stats dashboard, model grids

**Grid Systems:**
- Stats Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4 (for total tokens, uptime, requests, active requests)
- Model Display: grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 (provider cards with model lists)
- Admin Forms: Single column forms with max-w-2xl

### D. Component Library

**Navigation:**
- Top navbar: Sticky header with logo, nav links, dark mode toggle, admin button
- Sayori branding with pink accent, horizontal layout
- Mobile: Hamburger menu with slide-out drawer

**Dashboard Stats Cards:**
- White/dark surface with subtle border
- Large number display (text-3xl or text-4xl) with pink accent
- Label below in secondary text
- Real-time updating indicator (subtle pulse animation on change)
- Icon on left side using Heroicons

**Model Provider Cards:**
- Card layout with provider name header (background: secondary pink)
- Expandable/collapsible model list
- Model IDs in monospace font with enable/disable toggle switches
- "Check Models" button (outline variant) triggers API call
- Status indicator (connected/disconnected)

**Admin Forms:**
- Clean input fields with focus:ring-2 ring-pink-500
- Labels with text-sm font-medium
- "Add Extra Keys" button to append new key input fields
- Delete buttons with subtle red hover states
- Grouped sections with subtle dividers (border-t)

**User Token Management:**
- Table layout for token list (responsive cards on mobile)
- Inline editing capabilities
- Progress bars for RPD usage (pink fill, gray background)
- RPM display with live countdown

**Token Stats Modal:**
- Overlay modal with backdrop blur
- Model usage: Horizontal bar chart with pink bars
- Last used timestamp with relative time
- RPD remaining: Large display with fraction format "[50]/[100]"
- Close button (X) in top-right

**Buttons:**
- Primary: bg-pink-600 hover:bg-pink-700 text-white rounded-lg px-6 py-2.5
- Secondary: bg-transparent border border-pink-600 text-pink-600 hover:bg-pink-50 (dark: hover:bg-pink-950)
- Outline on images: bg-white/10 backdrop-blur-md border border-white/20 (no custom hover states)
- Destructive: bg-red-600 hover:bg-red-700 text-white

**Data Visualization:**
- Line chart for request trends (pink gradient area fill)
- Bar charts for model usage (pink bars with gray baseline)
- Live updating with smooth transitions
- Tooltip on hover with usage details

**Authentication Elements:**
- Centered login card on /admin route
- Username/password fields with show/hide toggle
- Session timeout warning toast
- Secure badge/indicator when authenticated

### E. Page Layouts

**Main Page (/)**
- Hero section: Clean header with Sayori Proxy branding, tagline, and "Check Your User Token" CTA button (80vh height with centered content)
- Real-time Stats Grid: 4-column grid below hero (total tokens, uptime, total requests, active requests)
- Available Models Section: Provider cards in multi-column grid, each showing enabled models with actual IDs
- Footer: Minimal with links and social proof

**Admin Dashboard (/admin)**
- Sidebar navigation (collapsed on mobile): Providers, User Tokens, Settings
- Main content area with tabbed interface
- Provider Management: List view with add/edit/delete actions, modal forms for configuration
- User Token Management: Table with inline actions, create token modal
- Settings: .env configuration helper, authentication mode selector

**User Token Stats View:**
- Modal or dedicated page
- Top: User token ID (monospace), last used timestamp
- Middle: Model usage chart (horizontal bars)
- Bottom: RPD counter with progress bar and fraction display

### F. Animations & Interactions

**Minimal Animation Strategy:**
- Stats updates: Smooth number counting animation (0.3s)
- Modal entry/exit: Scale and fade (0.2s ease-out)
- Toggle switches: Smooth slide transition (0.2s)
- No scroll-triggered animations or parallax effects
- Loading states: Simple pink spinner or skeleton screens

### G. Images

**Hero Section Image:**
- Abstract tech/network visualization as background with overlay
- Gradient overlay: pink-to-white (light mode) or pink-to-dark (dark mode) for text contrast
- Placement: Full-width hero background with centered content overlay

**Optional Accent Images:**
- Provider logos (if available) in provider cards
- Iconography from Heroicons for stats cards and navigation

---

**Design Principles:**
1. **Clarity First:** Developer tool needs instant comprehension - clear labels, obvious actions
2. **Pink as Accent:** Use pink purposefully for CTAs, active states, and data highlights - not everywhere
3. **Information Density:** Pack data efficiently without clutter - use cards and tables effectively
4. **Real-time Feel:** Subtle indicators for live updates without distracting animations
5. **Dark Mode Parity:** Equal polish in both modes - not an afterthought