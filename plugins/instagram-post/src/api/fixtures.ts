/**
 * Deterministic Instagram API fixtures.
 *
 * Shapes mirror real Graph API responses (verified Sept 2026), including the
 * awkward cases that break naive implementations: an absent `media_url`, an
 * empty caption, non-Latin text, and carousel children.
 */

import type { InstagramMedia } from "./instagram-types";

export const FIXTURE_ACCOUNT_ID = "17841400000000000";

export const imagePost: InstagramMedia = {
  id: "17895695668004550",
  media_type: "IMAGE",
  media_url: "https://scontent.cdninstagram.com/v/t51.29350-15/example.jpg",
  permalink: "https://www.instagram.com/p/CabcDefGhij/",
  caption: "Morning light over the harbour.",
  timestamp: "2026-08-15T09:30:00+0000",
  username: "example_account",
};

export const videoPost: InstagramMedia = {
  id: "17895695668004551",
  media_type: "VIDEO",
  media_url: "https://scontent.cdninstagram.com/v/t50.2886-16/example.mp4",
  thumbnail_url: "https://scontent.cdninstagram.com/v/t51.29350-15/example-thumb.jpg",
  permalink: "https://www.instagram.com/p/CabcDefGhik/",
  caption: "Behind the scenes from yesterday's shoot.",
  timestamp: "2026-08-14T17:05:00+0000",
  username: "example_account",
};

export const carouselPost: InstagramMedia = {
  id: "17895695668004552",
  media_type: "CAROUSEL_ALBUM",
  permalink: "https://www.instagram.com/p/CabcDefGhil/",
  caption: "Three views of the same afternoon.",
  timestamp: "2026-08-13T12:00:00+0000",
  username: "example_account",
  children: [
    {
      id: "17895695668004553",
      media_type: "IMAGE",
      media_url: "https://scontent.cdninstagram.com/v/t51.29350-15/child-1.jpg",
    },
    {
      id: "17895695668004554",
      media_type: "IMAGE",
      media_url: "https://scontent.cdninstagram.com/v/t51.29350-15/child-2.jpg",
    },
    {
      id: "17895695668004555",
      media_type: "IMAGE",
      media_url: "https://scontent.cdninstagram.com/v/t51.29350-15/child-3.jpg",
    },
  ],
};

/** No caption at all — the title must still be deterministic. */
export const emptyCaptionPost: InstagramMedia = {
  id: "17895695668004556",
  media_type: "IMAGE",
  media_url: "https://scontent.cdninstagram.com/v/t51.29350-15/no-caption.jpg",
  permalink: "https://www.instagram.com/p/CabcDefGhim/",
  timestamp: "2026-08-12T08:00:00+0000",
  username: "example_account",
};

/** Emoji, non-Latin script, line breaks, hashtags and mentions. */
export const unicodeCaptionPost: InstagramMedia = {
  id: "17895695668004557",
  media_type: "IMAGE",
  media_url: "https://scontent.cdninstagram.com/v/t51.29350-15/unicode.jpg",
  permalink: "https://www.instagram.com/p/CabcDefGhin/",
  caption:
    "صبح بخیر ☀️\nGood morning from the studio 🎬\n\nShot with @example_partner\n#morning #استودیو #behindthescenes",
  timestamp: "2026-08-11T06:15:00+0000",
  username: "example_account",
};

/** Caption that is nothing but hashtags — must not become the title. */
export const hashtagOnlyPost: InstagramMedia = {
  id: "17895695668004558",
  media_type: "IMAGE",
  media_url: "https://scontent.cdninstagram.com/v/t51.29350-15/hashtags.jpg",
  permalink: "https://www.instagram.com/p/CabcDefGhio/",
  caption: "#sunset #goldenhour #nofilter",
  timestamp: "2026-08-10T19:45:00+0000",
  username: "example_account",
};

/**
 * Meta omits `media_url` when a post carries copyrighted audio or downloads
 * are disabled. The import must degrade gracefully instead of failing.
 */
export const noMediaUrlPost: InstagramMedia = {
  id: "17895695668004559",
  media_type: "VIDEO",
  thumbnail_url: "https://scontent.cdninstagram.com/v/t51.29350-15/restricted-thumb.jpg",
  permalink: "https://www.instagram.com/p/CabcDefGhip/",
  caption: "Track of the week.",
  timestamp: "2026-08-09T15:00:00+0000",
  username: "example_account",
};

export const allFixturePosts: InstagramMedia[] = [
  imagePost,
  videoPost,
  carouselPost,
  emptyCaptionPost,
  unicodeCaptionPost,
  hashtagOnlyPost,
  noMediaUrlPost,
];

/** Generate N synthetic posts for pagination and large-import tests. */
export function generatePosts(count: number, startIndex = 0): InstagramMedia[] {
  return Array.from({ length: count }, (_, i) => {
    const index = startIndex + i;
    return {
      id: `generated-${index}`,
      media_type: "IMAGE" as const,
      media_url: `https://scontent.cdninstagram.com/v/t51.29350-15/generated-${index}.jpg`,
      permalink: `https://www.instagram.com/p/Generated${index}/`,
      caption: `Generated post ${index}`,
      // Descending timestamps mirror Instagram's newest-first ordering.
      timestamp: new Date(Date.UTC(2026, 0, 1) - index * 86_400_000).toISOString(),
      username: "example_account",
    };
  });
}

// ── Raw error envelopes, as Meta returns them ──

export const expiredTokenError = {
  error: {
    message: "Error validating access token: Session has expired",
    type: "OAuthException",
    code: 190,
    error_subcode: 463,
    fbtrace_id: "AbCdEfGhIjK",
  },
};

export const rateLimitError = {
  error: {
    message: "Application request limit reached",
    type: "OAuthException",
    code: 4,
    fbtrace_id: "AbCdEfGhIjL",
  },
};

export const permissionError = {
  error: {
    message: "The user has not granted the application the permission to publish",
    type: "OAuthException",
    code: 10,
    fbtrace_id: "AbCdEfGhIjM",
  },
};

export const invalidMediaError = {
  error: {
    message: "The image is not a valid format",
    type: "OAuthException",
    code: 100,
    error_subcode: 2207009,
    error_user_msg: "The media you selected is not in a supported format.",
    fbtrace_id: "AbCdEfGhIjN",
  },
};
