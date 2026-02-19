# Confluence Source Instructions

## Requirements

One of:
- Confluence MCP server connected and available
- `CONFLUENCE_URL` and `CONFLUENCE_TOKEN` environment variables set

## Fetching Content

### If MCP server available
Use the Confluence MCP tools to:
1. Search for pages by title or space
2. Fetch page content by ID
3. Get child pages for hierarchy

### If using API directly
```bash
# Get page content
curl -s -H "Authorization: Bearer $CONFLUENCE_TOKEN" \
  "$CONFLUENCE_URL/wiki/rest/api/content/<page-id>?expand=body.storage"

# Get child pages
curl -s -H "Authorization: Bearer $CONFLUENCE_TOKEN" \
  "$CONFLUENCE_URL/wiki/rest/api/content/<page-id>/child/page"
```

## Content Extraction

### From page URL
Extract page ID from URL: `https://domain.atlassian.net/wiki/spaces/SPACE/pages/<page-id>/Title`

### Process HTML content
- Extract text from body.storage.value
- Preserve code blocks and tables
- Note headings for structure

## Focus Areas for Concepts

- Page title and overview
- Key definitions and terminology
- Process descriptions
- Diagrams (note their presence, describe if possible)
- Links to related pages (for context)
- Code examples if present

## Prioritization

1. Main page content first
2. Immediate child pages for depth
3. Linked pages for breadth
4. Skip navigation/template content
5. Focus on substantive documentation
