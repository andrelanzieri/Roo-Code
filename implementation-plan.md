# Implementation Plan: Improve Error Display in Webview

## Overview

Currently, `cline.say("error", ...)` displays error text in red. We want to improve this to look more like the "Edit Unsuccessful" display with:

1. A custom title that can be passed as metadata
2. An expandable/collapsible UI pattern
3. The error text shown when expanded

## Current Implementation Analysis

### 1. Error Display Flow

- **Backend (Task.ts)**: `say("error", text)` method sends error messages
- **Frontend (ChatRow.tsx)**: Renders error messages with red text styling
- **Diff Error Pattern**: Already implements the expandable UI pattern we want to replicate

### 2. Diff Error Implementation (lines 960-1048 in ChatRow.tsx)

The diff_error display has:

- Warning icon with yellow/orange color
- Bold title ("Edit Unsuccessful")
- Copy button
- Expand/collapse chevron
- Expandable content area showing the error details

## Implementation Steps

### Step 1: Extend the say method signature

**File**: `src/core/task/Task.ts`

The say method already accepts an `options` parameter with metadata support. We need to:

- Document that error messages can include a `title` in metadata
- No changes needed to the method signature itself

### Step 2: Update ChatRow.tsx to handle enhanced error display

**File**: `webview-ui/src/components/chat/ChatRow.tsx`

Changes needed:

1. Add state for error expansion (similar to `isDiffErrorExpanded`)
2. Extract metadata from error messages
3. Render errors with the expandable UI pattern
4. Use custom title from metadata or default to "Error"

### Step 3: Update translation files

**Files**: All files in `webview-ui/src/i18n/locales/*/chat.json`

Add new translation keys:

- `error.defaultTitle`: Default title when no custom title is provided
- Keep existing `error` key for backward compatibility

### Step 4: Update existing error calls

Search for all `say("error", ...)` calls and optionally add metadata with custom titles where appropriate.

## Technical Details

### Message Structure

```typescript
// When calling say with error and custom title:
await this.say(
	"error",
	"Detailed error message here",
	undefined, // images
	false, // partial
	undefined, // checkpoint
	undefined, // progressStatus
	{
		metadata: {
			title: "Custom Error Title",
		},
	},
)
```

### Frontend Rendering Logic

```typescript
// In ChatRow.tsx, for case "error":
// 1. Extract title from metadata or use default
// 2. Render expandable UI similar to diff_error
// 3. Show error text in expanded section
```

## Benefits

1. **Consistency**: Error display matches the existing "Edit Unsuccessful" pattern
2. **Clarity**: Custom titles provide immediate context about the error type
3. **User Experience**: Collapsible errors reduce visual clutter
4. **Flexibility**: Backward compatible - existing error calls continue to work

## Testing Considerations

1. Test with errors that have custom titles
2. Test with errors without custom titles (should use default)
3. Test expand/collapse functionality
4. Test copy button functionality
5. Verify all translations work correctly

## Migration Strategy

- The implementation is backward compatible
- Existing `say("error", ...)` calls will continue to work
- We can gradually update error calls to include custom titles where beneficial
