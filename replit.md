# Sayori Proxy

## Overview

Sayori Proxy is a modern API proxy management system with a pink and white themed dashboard. The application provides a centralized platform for managing multiple AI provider connections, API keys, models, and user access tokens. It features a real-time statistics dashboard, admin controls for provider/model management, and flexible authentication options including user token-based access control with rate limiting.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework:** React 18 with TypeScript
- **Build Tool:** Vite for fast development and optimized production builds
- **Routing:** Wouter for lightweight client-side routing
- **State Management:** TanStack Query (React Query) for server state management
- **UI Framework:** Shadcn/ui components built on Radix UI primitives
- **Styling:** Tailwind CSS with custom design system

**Design System:**
- Pink and white color scheme with comprehensive light/dark mode support
- Custom CSS variables for theming (primary pink: HSL 330 85% 60%)
- Typography using Inter for UI and JetBrains Mono for code/technical content
- Component variants following "New York" style from Shadcn
- Hover and active state elevation using CSS custom properties

**Key Pages:**
- `/` - Public dashboard displaying stats and available models
- `/admin` - Admin panel for managing providers, API keys, models, and user tokens

### Backend Architecture

**Technology Stack:**
- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js for REST API
- **Real-time:** WebSocket support via ws library
- **Database:** Drizzle ORM configured for PostgreSQL (Neon serverless)
- **Storage:** Currently using JSON file-based storage (database.json) with interface designed for easy migration to PostgreSQL

**Authentication Strategy:**
- Three-tier authentication system:
  1. **Admin Auth:** Basic authentication for admin panel
  2. **User Token Auth:** Bearer token system with rate limiting (requests per day/minute)
  3. **General Password:** Optional general access password
  4. **No Auth:** Optional open access mode

**API Architecture:**
- RESTful endpoints with consistent error handling
- Admin routes protected with Basic auth middleware
- User routes protected with Bearer token middleware
- Rate limiting enforced at middleware level (maxRPD, maxRPM)
- Proxy functionality for routing requests through multiple AI providers

**Core Business Logic:**
- Round-robin API key rotation for load distribution
- Usage tracking per user token and model
- Real-time statistics aggregation (tokens, requests, success rate, uptime)
- Provider health checking and model discovery

### Data Storage Solutions

**Current Implementation:**
- JSON file-based storage (database.json)
- In-memory data structures with file persistence
- Schema validation using Zod

**Database Schema (designed for PostgreSQL migration):**
- **Providers:** id, name, baseUrl, enabled, createdAt
- **ApiKeys:** id, providerId, key, lastUsed, requestCount
- **Models:** id, providerId, modelId, enabled
- **UserTokens:** id, name, token, maxRPD, maxRPM, createdAt
- **UsageRecords:** id, userTokenId, modelId, tokensUsed, timestamp
- **AdminCredentials:** username, password
- **Settings:** authMode, generalPassword

**Migration Path:**
- Drizzle ORM already configured for PostgreSQL
- Schema defined in shared/schema.ts
- Storage interface (IStorage) allows swapping implementations
- All database operations abstracted through storage layer

### External Dependencies

**UI Libraries:**
- @radix-ui/* - Headless UI primitives for accessible components
- class-variance-authority - Type-safe component variants
- cmdk - Command palette functionality
- recharts - Charts for usage visualization
- date-fns - Date formatting and manipulation

**Backend Services:**
- @neondatabase/serverless - PostgreSQL driver for Neon
- drizzle-orm - Type-safe database ORM
- connect-pg-simple - PostgreSQL session store
- cors - Cross-origin resource sharing
- ws - WebSocket implementation

**Development Tools:**
- Vite with React plugin
- TypeScript for type safety
- ESBuild for server bundling
- Tailwind CSS with PostCSS
- @replit/* plugins for Replit environment integration

**Google Fonts:**
- Inter - Primary UI font family
- JetBrains Mono - Monospace for code/technical content
- Pacifico - Script font for branding

**API Integration Points:**
- Multiple AI provider endpoints (configurable base URLs)
- WebSocket connections for real-time updates
- RESTful proxy endpoints for AI model requests