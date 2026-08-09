# Enterprise Commerce Hub

Enterprise Commerce Hub is a professional e-commerce administration platform designed for centralized management of products, inventory, orders, customers, brands, categories, coupons, reviews, reports, and administrative users.

## Overview

The platform provides a centralized administrative workspace for operating and monitoring an e-commerce business through a modern, responsive interface.

It is designed with a modular architecture so additional business functionality, APIs, authentication, payment services, analytics, and third-party integrations can be added as the system evolves.

## Core Modules

* Dashboard
* Products
* Product creation and management
* Inventory management
* Orders
* Order details
* Customers
* Customer details
* Categories
* Brands
* Coupons
* Reviews
* Reports
* Users
* Activity monitoring
* Settings

## Technology Stack

### Frontend

* React
* TypeScript
* TanStack Router
* TanStack Query
* Tailwind CSS
* shadcn/ui
* Radix UI
* Lucide React
* React Hook Form
* Zod
* Recharts

### Application

* Vite
* TanStack Start
* Nitro
* React 19

### Development

* Yarn
* ESLint
* Prettier
* TypeScript

## Project Structure

```text
src/
├── components/
│   ├── kit/
│   ├── layout/
│   └── ui/
│
├── hooks/
│
├── lib/
│
├── routes/
│   ├── activity.tsx
│   ├── brands.tsx
│   ├── categories.tsx
│   ├── coupons.tsx
│   ├── customers.index.tsx
│   ├── customers.$customerId.tsx
│   ├── inventory.tsx
│   ├── login.tsx
│   ├── orders.index.tsx
│   ├── orders.$orderId.tsx
│   ├── products.index.tsx
│   ├── products.new.tsx
│   ├── reports.tsx
│   ├── reviews.tsx
│   ├── settings.tsx
│   ├── users.tsx
│   └── __root.tsx
│
├── router.tsx
├── routeTree.gen.ts
├── server.ts
├── start.ts
└── styles.css
```

## Getting Started

### Requirements

Make sure the following are installed:

* Node.js
* Yarn

### Installation

Clone the repository and install dependencies:

```bash
yarn install
```

### Development

Start the development server:

```bash
yarn dev
```

The application will be available at:

```text
http://localhost:8080
```

### Production Build

Create a production build:

```bash
yarn build
```

### Preview Production Build

```bash
yarn preview
```

## Code Quality

Run ESLint:

```bash
yarn lint
```

Format the project:

```bash
yarn format
```

## Architecture

The application follows a modular route and component architecture.

Reusable UI components are organized separately from business modules, while application routes provide dedicated interfaces for each administrative area.

TanStack Query is used for server-state management, while TanStack Router provides application routing.

## Development Roadmap

Potential future integrations include:

* REST API integration
* Authentication and authorization
* Role-based access control
* MongoDB
* Product image management
* Payment gateway integration
* Shipping integration
* Email notifications
* Customer notifications
* Advanced analytics
* Audit logging
* Multi-store management
* Multi-warehouse inventory
* Sales dashboards
* Financial reporting

## License

This project is maintained as a private commercial software project.

All rights reserved.
