
import asyncio
import logging
import os
import re
from collections import Counter
from functools import lru_cache
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cloud Research Paper Recommendation Engine",
    description=(
        "Research paper search, similarity ranking, "
        "research gap analysis, and novelty estimation."
    ),
    version="1.0.0",
)

# Configure FRONTEND_ORIGIN in AWS if your frontend has a deployed URL.
frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGIN",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

OPENALEX_URL = "https://api.openalex.org/works"
OPENALEX_EMAIL = os.getenv("OPENALEX_EMAIL", "")
OPENALEX_API_KEY = os.getenv("OPENALEX_API_KEY", "")
REQUEST_TIMEOUT = 25.0
MAX_PER_PAGE = 100


class ResearchQuery(BaseModel):
    topic: str = Field(..., min_length=3, max_length=1000)
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=MAX_PER_PAGE)


class NoveltyQuery(BaseModel):
    topic: str = Field(..., min_length=3, max_length=1000)
    research_idea: Optional[str] = Field(default=None, max_length=5000)
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=MAX_PER_PAGE)


def reconstruct_abstract(inverted_index):
    """Reconstruct an abstract from OpenAlex's inverted index."""
    if not isinstance(inverted_index, dict):
        return ""

    words = []
    for word, positions in inverted_index.items():
        if isinstance(positions, list):
            for position in positions:
                if isinstance(position, int) and position >= 0:
                    words.append((position, word))

    words.sort(key=lambda item: item[0])
    return " ".join(word for _, word in words)


def clean_text(value):
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()


def paper_text(paper):
    return " ".join(
        part for part in [
            paper.get("title", ""),
            paper.get("abstract", ""),
        ] if part
    )


async def openalex_get(params):
    request_params = dict(params)

    if OPENALEX_API_KEY:
    request_params["api_key"] = OPENALEX_API_KEY

    if OPENALEX_EMAIL:
        request_params["mailto"] = OPENALEX_EMAIL

    last_error = None

    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": "CloudResearchEngine/1.0"},
    ) as client:
        for attempt in range(3):
            try:
                response = await client.get(
                    OPENALEX_URL,
                    params=request_params,
                )
                response.raise_for_status()
                return response.json()

            except httpx.HTTPStatusError as exc:
                last_error = exc
                status = exc.response.status_code

                if status != 429 and status < 500:
                    break

            except (httpx.TimeoutException, httpx.RequestError) as exc:
                last_error = exc

            if attempt < 2:
                await asyncio.sleep(attempt + 1)

    if last_error:
        logger.exception(
            "OpenAlex request failed",
            exc_info=(
                type(last_error),
                last_error,
                last_error.__traceback__,
            ),
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "OpenAlex request failed: "
                f"{type(last_error).__name__}: {str(last_error)[:500]}"
            ),
        ) from last_error

    raise HTTPException(
        status_code=502,
        detail="OpenAlex request failed without an error description.",
    )


async def retrieve_papers(topic, page=1, per_page=20):
    """Fetch a live page of works from OpenAlex."""
    data = await openalex_get({
        "search": topic,
        "page": page,
        "per_page": per_page,
        "select": (
            "id,doi,title,publication_year,publication_date,"
            "authorships,abstract_inverted_index,primary_location,"
            "type,cited_by_count,open_access"
        ),
    })

    results = []

    for item in data.get("results", []):
        title = clean_text(item.get("title")) or "Untitled paper"
        abstract = reconstruct_abstract(
            item.get("abstract_inverted_index")
        )

        authors = []
        for authorship in item.get("authorships") or []:
            author = (authorship.get("author") or {}).get("display_name")
            if author:
                authors.append(author)

        location = item.get("primary_location") or {}
        source = location.get("source") or {}
        landing_page = location.get("landing_page_url")
        doi = item.get("doi")

        results.append({
            "id": item.get("id"),
            "title": title,
            "abstract": abstract,
            "year": item.get("publication_year"),
            "publication_date": item.get("publication_date"),
            "authors": authors,
            "doi": doi,
            "url": doi or landing_page or item.get("id"),
            "source": source.get("display_name"),
            "type": item.get("type"),
            "citation_count": item.get("cited_by_count", 0),
            "is_open_access": (
                (item.get("open_access") or {}).get("is_oa")
            ),
        })

    return {
        "papers": results,
        "total_available": (data.get("meta") or {}).get("count", 0),
        "page": page,
        "per_page": per_page,
    }


def rank_papers(topic, papers):
    """Rank papers using TF-IDF vectors and cosine similarity."""
    usable = [paper for paper in papers if paper_text(paper).strip()]

    if not usable:
        return []

    documents = [topic] + [paper_text(paper) for paper in usable]

    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=20000,
            sublinear_tf=True,
        )
        matrix = vectorizer.fit_transform(documents)
        scores = cosine_similarity(matrix[0:1], matrix[1:]).flatten()
    except ValueError:
        scores = [0.0] * len(usable)

    ranked = []

    for paper, score in zip(usable, scores):
        result = dict(paper)
        result["similarity_score"] = round(float(score) * 100, 2)
        result["abstract_available"] = bool(paper.get("abstract"))
        ranked.append(result)

    ranked.sort(
        key=lambda paper: paper["similarity_score"],
        reverse=True,
    )
    return ranked


def extract_gap_themes(papers, limit=15):
    """
    Find terms and phrases that occur across fewer retrieved abstracts.
    These are candidate themes for investigation, not verified research gaps.
    """
    documents = [
        paper.get("abstract", "")
        for paper in papers
        if paper.get("abstract", "").strip()
    ]

    if len(documents) < 2:
        return {
            "abstract_count": len(documents),
            "gaps": [],
            "message": (
                "Not enough accessible abstracts to analyze themes. "
                "Try another topic or retrieve more papers."
            ),
        }

    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=5000,
            min_df=1,
            max_df=0.95,
        )
        matrix = vectorizer.fit_transform(documents)
    except ValueError:
        return {
            "abstract_count": len(documents),
            "gaps": [],
            "message": "No usable text themes were found in these abstracts.",
        }

    features = vectorizer.get_feature_names_out()
    gaps = []

    for column, term in enumerate(features):
        column_values = matrix[:, column].toarray().flatten()
        present = int((column_values > 0).sum())

        # Filter out terms appearing in nearly every abstract.
        if present < 1 or present >= len(documents):
            continue

        gaps.append({
            "theme": term,
            "paper_count": present,
            "coverage_percent": round(
                present / len(documents) * 100, 2
            ),
            "mean_tfidf": round(
                float(column_values[column_values > 0].mean()), 4
            ),
        })

    gaps.sort(
        key=lambda item: (
            item["paper_count"],
            -item["mean_tfidf"],
        )
    )

    return {
        "abstract_count": len(documents),
        "gaps": gaps[:limit],
        "message": (
            "These are underrepresented terms in the retrieved abstracts. "
            "Review the supporting papers and existing literature before "
            "claiming a research gap."
        ),
    }


@app.get("/")
async def root():
    return {
        "message": "Cloud Research Engine API is running!",
        "status": "connected",
    }


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/provider-health")
async def provider_health():
    try:
        data = await openalex_get({
            "search": "machine learning",
            "per_page": 1,
            "select": "id",
        })
        return {
            "status": "available",
            "provider": "OpenAlex",
            "results_returned": len(data.get("results", [])),
        }
    except HTTPException as exc:
        return {
            "status": "unavailable",
            "provider": "OpenAlex",
            "detail": exc.detail,
        }


@app.post("/api/research/search")
async def search_research(request: ResearchQuery):
    query = clean_text(request.topic)

    data = await retrieve_papers(
        query,
        page=request.page,
        per_page=request.per_page,
    )
    ranked = rank_papers(query, data["papers"])

    return {
        "status": "completed",
        "provider": "OpenAlex",
        "method": "TF-IDF vectorization and cosine similarity",
        "query": query,
        "total_available": data["total_available"],
        "page": data["page"],
        "per_page": data["per_page"],
        "paper_count": len(ranked),
        "papers": ranked,
    }


@app.post("/api/research/gaps")
async def analyze_research_gaps(request: ResearchQuery):
    query = clean_text(request.topic)

    data = await retrieve_papers(
        query,
        page=request.page,
        per_page=request.per_page,
    )
    analysis = extract_gap_themes(data["papers"])

    return {
        "status": "completed",
        "provider": "OpenAlex",
        "method": "TF-IDF theme coverage across retrieved abstracts",
        "topic": query,
        "total_available": data["total_available"],
        "page": data["page"],
        "paper_count": len(data["papers"]),
        "abstract_count": analysis["abstract_count"],
        "abstract_coverage_percent": round(
            analysis["abstract_count"] / len(data["papers"]) * 100, 2
        ) if data["papers"] else 0,
        "gaps": analysis["gaps"],
        "message": analysis["message"],
    }


@app.post("/api/research/novelty")
async def analyze_research_novelty(request: NoveltyQuery):
    query = clean_text(request.research_idea or request.topic)

    data = await retrieve_papers(
        request.topic,
        page=request.page,
        per_page=request.per_page,
    )
    ranked = rank_papers(query, data["papers"])

    if not ranked:
        return {
            "status": "completed",
            "provider": "OpenAlex",
            "topic": request.topic,
            "research_idea": query,
            "paper_count": 0,
            "novelty_score": None,
            "assessment": "insufficient_evidence",
            "message": (
                "No usable papers were retrieved. Novelty cannot be estimated."
            ),
            "similar_papers": [],
        }

    top_similarity = ranked[0]["similarity_score"]
    average_top_similarity = round(
        sum(paper["similarity_score"] for paper in ranked[:5])
        / min(5, len(ranked)),
        2,
    )

    # A heuristic estimate only; this is not a validated novelty metric.
    novelty_score = round(max(0.0, min(100.0, 100.0 - top_similarity)), 2)

    if top_similarity >= 70:
        assessment = "high_similarity_to_existing_work"
    elif top_similarity >= 40:
        assessment = "moderate_similarity_review_needed"
    else:
        assessment = "lower_similarity_requires_manual_verification"

    return {
        "status": "completed",
        "provider": "OpenAlex",
        "method": "TF-IDF cosine similarity heuristic",
        "topic": request.topic,
        "research_idea": query,
        "paper_count": len(ranked),
        "novelty_score": novelty_score,
        "highest_similarity_percent": top_similarity,
        "average_top_5_similarity_percent": average_top_similarity,
        "assessment": assessment,
        "message": (
            "This score measures textual dissimilarity from the retrieved "
            "sample; it does not prove originality. Results depend on the "
            "search query, retrieved papers, and abstract availability. "
            "Review full papers and related work before claiming novelty."
        ),
        "similar_papers": ranked[:10],
    }
