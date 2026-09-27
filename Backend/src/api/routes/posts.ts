import { Router, Request, Response } from "express";
import { Database, Post } from "../../db";
import { ApiErrorResponse, PostListResponse, PostResponse } from "../contracts";
import { serializeBigInt } from "../index";
import {
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  MAX_LIMIT,
  parseLimit,
  parseNumericId,
  parseOffset,
  parseOptionalStellarAddress,
  sendValidationError,
  validate,
} from "../validation";

const parseListLimit = parseLimit(MAX_LIMIT, DEFAULT_LIMIT);

/**
 * Serialize a Post record to its API representation.
 *
 * BE-23: All date fields are serialized as ISO 8601 strings so consumers
 * receive a consistent, timezone-unambiguous format. Null/undefined dates
 * are surfaced as null rather than being omitted or coerced to an empty
 * string.
 */
function serializePost(post: Post): Record<string, unknown> {
  return {
    id: post.id.toString(),
    author: post.author,
    content: post.content,
    deleted: post.deleted,
    tip_total: post.tip_total.toString(),
    like_count: post.like_count.toString(),
    created_ledger: post.created_ledger,
    deleted_ledger: post.deleted_ledger ?? null,
    created_at:
      post.created_at instanceof Date && !isNaN(post.created_at.getTime())
        ? post.created_at.toISOString()
        : post.created_at != null
          ? String(post.created_at)
          : null,
    deleted_at:
      post.deleted_at instanceof Date && !isNaN(post.deleted_at.getTime())
        ? post.deleted_at.toISOString()
        : post.deleted_at != null
          ? String(post.deleted_at)
          : null,
  };
}

export function createPostsRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /posts?author=<address>&limit=<n>&offset=<n>
   * Lists posts with optional author filter and pagination.
   */
  router.get(
    "/",
    async (req: Request, res: Response<PostListResponse | ApiErrorResponse>): Promise<void> => {
      const parsed = validate<{ author?: string; limit: number; offset: number }>(
        {
          // `author` is a wallet address, so it is validated as one rather than
          // passed through as an arbitrary string filter (issue #665).
          author: { parse: parseOptionalStellarAddress, required: false },
          limit: { parse: parseListLimit, required: false, default: DEFAULT_LIMIT },
          offset: { parse: parseOffset, required: false, default: DEFAULT_OFFSET },
        },
        { author: req.query.author, limit: req.query.limit, offset: req.query.offset }
      );
      if (!parsed.ok) {
        sendValidationError(res, parsed.issue);
        return;
      }

      const { author, limit, offset } = parsed.value;
      const { posts, total } = await db.listPosts({ author, limit, offset });
      res.json({
        posts: posts.map(serializePost),
        total,
        limit,
        offset,
        has_more: offset + posts.length < total,
      } as unknown as PostListResponse);
    }
  );

  /**
   * GET /posts/:id
   * Returns a single post by its numeric ID.
   */
  router.get(
    "/:id",
    async (req: Request, res: Response<PostResponse | ApiErrorResponse>): Promise<void> => {
      const parsed = parseNumericId(req.params.id);
      if (!parsed.ok) {
        sendValidationError(res, parsed.issue);
        return;
      }

      const post = await db.getPost(parsed.value);
      if (!post) {
        res.status(404).json({ error: "Post not found", code: "NOT_FOUND" });
        return;
      }

      res.json(serializePost(post) as unknown as PostResponse);
    }
  );

  return router;
}
