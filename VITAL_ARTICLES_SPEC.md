# Vital Articles Implementation Spec

## Problem
Articles are too obscure - users don't know what they are or how to get there.

## Solution
Use Wikipedia's Level 3 Vital Articles (1,003 well-known articles) for both start and target.

## Implementation

### Files Modified
1. `src/vitalArticles.json` - Static list of 1,003 vital article titles
2. `src/wikipedia.ts` - Updated to use vital articles for both start and target

### How It Works
```typescript
import vitalArticles from './vitalArticles.json';

const startTitle = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];
const targetTitle = vitalArticles[Math.floor(Math.random() * vitalArticles.length)];
```

**Behavior:**
- Start article: Random selection from vital articles list
- Target article: Random selection from vital articles list

## Benefits
- Simple: Just an import and array access
- Clean: ~15 lines of readable code
- Fast: No API calls needed
- Reliable: Static data, no network dependency
- Accessible: Both articles are well-known (Albert Einstein, World War II, etc.)
- Predictable: Users recognize both the start and destination

## Files
- `src/vitalArticles.json` - 1,003 article titles
- `src/wikipedia.ts` - Updated game logic
