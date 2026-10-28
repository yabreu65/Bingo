# Premium Festivo design system

U0 introduces the visual foundation without wiring it into production screens. The current application remains unchanged until U1–U6 migrate each surface.

## Usage

Import `tokens.css` once from the application entry stylesheet and import `primitives.jsx` from the component that needs a primitive. Components are intentionally prefixed with `pf-` to avoid collisions with existing CSS.

```jsx
import { Button, Card, StatusBadge } from '../design-system/primitives';

<Card raised>
  <StatusBadge tone="success">Ready</StatusBadge>
  <Button>Start game</Button>
</Card>
```

## Migration order

- **U1 Landing:** `Container`, `Stack`, `Cluster`, `Button`, `Card`.
- **U2 Organizer:** `Panel`, `Field`, `StatusBadge`, `Modal`.
- **U3 Player:** `Card`, `StatusBadge`, `Button`, responsive container rules.
- **U4 TV:** `Panel`, `StatusBadge`, dedicated fullscreen stage tokens.
- **U5 Challenges:** `Modal`, `Field`, `Button`, status and reduced-motion rules.
- **U6 Results:** `Card`, `Panel`, `StatusBadge`, celebration motion and visual regression baselines.

All interactive controls must preserve a minimum 44×44 px target, visible focus, keyboard access, and reduced-motion behavior. Keep game logic, Socket.IO contracts, data access, and media resolution outside these primitives.
