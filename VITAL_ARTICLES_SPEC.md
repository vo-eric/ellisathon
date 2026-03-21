# Vital Articles Implementation Spec

## Problem
Target articles are too obscure - users don't know what they are or how to get there.

## Solution
Use Wikipedia's Level 3 Vital Articles (1,003 well-known articles) for target selection.

## Implementation

### Files Modified
1. `src/vitalArticles.json` - Static list of 1,003 vital article titles
2. `src/wikipedia.ts` - Updated to use vital articles for targets

### How It Works
```typescript
import vitalArticles from './vitalArticles.json';

// Fetch 1 random article for start
// Pick random target from vital articles array
const targetTitle = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];
```

**Behavior:**
- Start article: Random Wikipedia article (unchanged)
- Target article: Random selection from vital articles list

## Benefits
- Simple: Just an import and array access
- Clean: ~30 lines of readable code
- Fast: No runtime API calls for vital articles
- Reliable: Static data, no network dependency
- Accessible: Target articles are well-known (Albert Einstein, World War II, etc.)
- Variety: Start articles remain fully random

## Files
- `src/vitalArticles.json` - 1,003 article titles
- `src/wikipedia.ts` - Updated game logic
