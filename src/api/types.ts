// The response types are generated (./schemas/types.ts); these name the parts of them the app uses.
import type { LinksPage, Metadata, SearchResults, TagsPage } from './schemas/types'

export type * from './schemas/types'
export type Link = LinksPage['links'][number]
export type SearchHit = SearchResults['hits'][number]
export type MetadataProperty = Metadata['properties'][number]
export type MetadataTag = Metadata['tags'][number]
export type TagCount = TagsPage['tags'][number]
