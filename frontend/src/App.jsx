
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "https://cloud-research-engine-api.onrender.com";
const PER_PAGE = 20;

const navigation = [
  { id: "search", label: "Research Search", icon: "⌕" },
  { id: "results", label: "Scholar Results", icon: "▤" },
  { id: "recommended", label: "Recommended", icon: "✧" },
  { id: "similarity", label: "Similarity", icon: "▥" },
  { id: "gaps", label: "Research Gaps", icon: "▱" },
  { id: "novelty", label: "Novelty Analysis", icon: "♧" },
];

function App() {
  const [activePage, setActivePage] = useState("search");
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [topic, setTopic] = useState("");
  const [searchedTopic, setSearchedTopic] = useState("");
  const [papers, setPapers] = useState([]);
  const [totalResults, setTotalResults] = useState(0);
  const [page, setPage] = useState(1);
  const [searchMessage, setSearchMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [gapTopic, setGapTopic] = useState("");
  const [gapPerPage, setGapPerPage] = useState(50);
  const [gapData, setGapData] = useState(null);
  const [gapsLoading, setGapsLoading] = useState(false);
  const [gapsError, setGapsError] = useState("");

  const [noveltyTopic, setNoveltyTopic] = useState("");
  const [noveltyPerPage, setNoveltyPerPage] = useState(50);
  const [noveltyData, setNoveltyData] = useState(null);
  const [noveltyLoading, setNoveltyLoading] = useState(false);
  const [noveltyError, setNoveltyError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkBackend() {
      try {
        const response = await fetch(`${API_URL}/api/health`);
        if (!response.ok) {
          throw new Error("Backend unavailable");
        }
        if (!cancelled) setBackendStatus("Connected");
      } catch {
        if (!cancelled) setBackendStatus("Disconnected");
      }
    }

    checkBackend();

    return () => {
      cancelled = true;
    };
  }, []);

  async function fetchPapers(requestedPage, append = false) {
    const cleanTopic = topic.trim();

    if (!cleanTopic) {
      setSearchMessage("Enter a research topic before searching.");
      setActivePage("search");
      return;
    }

    if (append) {
      setLoadingMore(true);
    } else {
      setSearching(true);
      setPapers([]);
      setTotalResults(0);
      setPage(1);
      setSearchedTopic(cleanTopic);
    }

    setSearchMessage("");

    try {
      const response = await fetch(`${API_URL}/api/research/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: cleanTopic,
          page: requestedPage,
          per_page: PER_PAGE,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(", ")
          : data.detail;

        throw new Error(
          detail || "The research search could not be completed."
        );
      }

      const incoming = data.papers || [];

      setPapers((previous) => {
        const combined = append ? [...previous, ...incoming] : incoming;
        const unique = new Map();

        combined.forEach((paper) => {
          unique.set(paper.id || paper.doi || paper.title, paper);
        });

        return Array.from(unique.values());
      });

      setTotalResults(data.total_results || 0);
      setPage(requestedPage);

      if (incoming.length === 0 && !append) {
        setSearchMessage("No papers were found. Try another topic.");
      }
    } catch (error) {
      setSearchMessage(error.message || "An unexpected error occurred.");

      if (!append) {
        setPapers([]);
        setTotalResults(0);
      }
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  }

  function handleSearch(event) {
    event.preventDefault();
    setActivePage("results");
    fetchPapers(1, false);
  }

  function loadMore() {
    if (!searching && !loadingMore && papers.length < totalResults) {
      fetchPapers(page + 1, true);
    }
  }

  function navigateTo(pageId) {
    setActivePage(pageId);
    setSearchMessage("");

    if (pageId === "gaps") {
      setGapTopic((previous) =>
        previous.trim() ? previous : searchedTopic || topic
      );
    }

    if (pageId === "novelty") {
      setNoveltyTopic((previous) =>
        previous.trim() ? previous : searchedTopic || topic
      );
    }
  }

  async function analyzeResearchGaps(event) {
    event.preventDefault();

    const cleanTopic = gapTopic.trim();

    if (!cleanTopic) {
      setGapsError("Enter a research topic before analyzing research gaps.");
      return;
    }

    setGapsLoading(true);
    setGapsError("");
    setGapData(null);

    try {
      const response = await fetch(`${API_URL}/api/research/gaps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          topic: cleanTopic,
          per_page: Number(gapPerPage),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(", ")
          : data.detail;

        throw new Error(
          detail || "Research gap analysis could not be completed."
        );
      }

      setGapData(data);
    } catch (error) {
      setGapsError(
        error.message ||
          "Unable to connect to the research gap analysis service."
      );
    } finally {
      setGapsLoading(false);
    }
  }

  async function analyzeNovelty(event) {
    event.preventDefault();

    const cleanTopic = noveltyTopic.trim();

    if (!cleanTopic) {
      setNoveltyError("Enter a proposed research idea before analyzing.");
      return;
    }

    setNoveltyLoading(true);
    setNoveltyError("");
    setNoveltyData(null);

    try {
      const response = await fetch(`${API_URL}/api/research/novelty`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          topic: cleanTopic,
          per_page: Number(noveltyPerPage),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg).join(", ")
          : data.detail;

        throw new Error(
          detail || "Novelty analysis could not be completed."
        );
      }

      setNoveltyData(data);
    } catch (error) {
      setNoveltyError(
        error.message ||
          "Unable to connect to the novelty analysis service. Check that the backend is running."
      );
    } finally {
      setNoveltyLoading(false);
    }
  }

  const hasMore = papers.length < totalResults;

  function renderSearchPage() {
    return (
      <>
        <section className="page-intro">
          <h2>Research Search</h2>
          <p>
            Search academic literature using a topic, research question,
            keywords, or abstract.
          </p>
        </section>

        <section className="search-panel">
          <form onSubmit={handleSearch}>
            <label htmlFor="research-topic">
              Enter your research topic, research question, keywords, or
              abstract
            </label>

            <textarea
              id="research-topic"
              value={topic}
              maxLength={3000}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="For example: AI disease prediction"
              rows={6}
            />

            <div className="search-footer">
              <span>{topic.length}/3000</span>
              <button type="submit" disabled={searching}>
                {searching ? "Searching..." : "Search Research Papers"}
              </button>
            </div>
          </form>

          {searchMessage && (
            <p className="search-message" role="status">
              {searchMessage}
            </p>
          )}
        </section>

        <section className="workflow-panel">
          <h3>Research Analysis Workflow</h3>
          <p className="workflow-description">
            The workflow used by your research recommendation system.
          </p>

          <div className="workflow-list">
            {[
              ["01", "User Query"],
              ["02", "Academic Paper Search"],
              ["03", "Text Embeddings"],
              ["04", "Cosine Similarity"],
              ["05", "Paper Ranking"],
              ["06", "Research Gap Analysis"],
              ["07", "Potential Novelty Analysis"],
            ].map(([number, title]) => (
              <div className="workflow-step" key={number}>
                <span className="workflow-number">{number}</span>
                <span>{title}</span>
              </div>
            ))}
          </div>

          <p className="workflow-note">
            Current implementation: OpenAlex paper discovery, text embeddings,
            similarity-based ranking, TF-IDF research gap analysis, and
            candidate novelty analysis. Results depend on the literature
            retrieved and the information available for each paper.
          </p>
        </section>
      </>
    );
  }

  function renderResultsPage() {
    return (
      <>
        <section className="page-intro">
          <h2>Scholar Results</h2>
          <p>
            Browse papers returned by the current academic search provider,
            OpenAlex.
          </p>
        </section>

        {searchedTopic && (
          <div className="results-summary">
            <div>
              <span className="summary-label">SEARCH TOPIC</span>
              <h3>{searchedTopic}</h3>
            </div>
            <div>
              <span className="summary-label">MATCHING WORKS</span>
              <h3>{totalResults.toLocaleString()}</h3>
            </div>
            <div>
              <span className="summary-label">LOADED PAPERS</span>
              <h3>{papers.length.toLocaleString()}</h3>
            </div>
          </div>
        )}

        {!searchedTopic && (
          <div className="empty-state">
            <h3>No search results yet</h3>
            <p>Start by entering your research topic.</p>
            <button onClick={() => navigateTo("search")}>
              Go to Research Search
            </button>
          </div>
        )}

        {searchMessage && (
          <p className="search-message" role="status">
            {searchMessage}
          </p>
        )}

        <div className="papers-list">
          {papers.map((paper, index) => (
            <article
              className="paper-card"
              key={paper.id || paper.doi || `${paper.title}-${index}`}
            >
              <div className="paper-card-top">
                <span className="paper-number">
                  PAPER {String(index + 1).padStart(2, "0")}
                </span>
                {paper.open_access && (
                  <span className="open-access-badge">Open Access</span>
                )}
              </div>

              <h3>{paper.title || "Untitled paper"}</h3>

              <p className="paper-authors">
                {paper.authors?.length
                  ? paper.authors.slice(0, 5).join(", ") +
                    (paper.authors.length > 5 ? " et al." : "")
                  : "Author information unavailable"}
              </p>

              <div className="paper-metadata">
                {paper.year && <span>Year: {paper.year}</span>}
                {paper.journal && <span>Source: {paper.journal}</span>}
                <span>
                  Citations: {(paper.citations || 0).toLocaleString()}
                </span>
              </div>

              {paper.abstract ? (
                <p className="paper-abstract">{paper.abstract}</p>
              ) : (
                <p className="paper-abstract muted">
                  Abstract unavailable in the current search response.
                </p>
              )}

              {renderPaperActions(paper)}
            </article>
          ))}
        </div>

        {searching && <p className="loading-message">Searching papers...</p>}

        {papers.length > 0 && hasMore && (
          <div className="load-more-container">
            <button
              className="load-more-button"
              onClick={loadMore}
              disabled={loadingMore || searching}
            >
              {loadingMore ? "Loading..." : "Load More Papers"}
            </button>
            <p>
              {papers.length.toLocaleString()} of{" "}
              {totalResults.toLocaleString()} provider-reported results loaded.
            </p>
          </div>
        )}
      </>
    );
  }

  function renderPaperActions(paper) {
    return (
      <div className="paper-actions">
        {paper.url && (
          <a href={paper.url} target="_blank" rel="noreferrer">
            View Paper
          </a>
        )}
        {paper.pdf_url && (
          <a href={paper.pdf_url} target="_blank" rel="noreferrer">
            Open Full Text
          </a>
        )}
      </div>
    );
  }

  function renderRecommendedPage(sortedPapers) {
    return (
      <section className="ranked-papers-section">
        <div className="ranked-papers-heading">
          <div>
            <h3>Recommended Papers</h3>
            <p className="workflow-description">
              Papers ranked by semantic similarity to your research topic.
            </p>
          </div>
          <span className="ranked-paper-count">
            {sortedPapers.length} papers
          </span>
        </div>

        <div className="papers-list">
          {sortedPapers.map((paper, index) => (
            <article
              className="paper-card ranked-paper-card"
              key={paper.id || paper.doi || `${paper.title}-${index}`}
            >
              <div className="paper-card-top">
                <span className="paper-number">
                  RECOMMENDATION {String(index + 1).padStart(2, "0")}
                </span>
                {paper.open_access && (
                  <span className="open-access-badge">Open Access</span>
                )}
              </div>

              <h3>{paper.title || "Untitled paper"}</h3>

              <p className="paper-authors">
                {paper.authors?.length
                  ? paper.authors.slice(0, 5).join(", ") +
                    (paper.authors.length > 5 ? " et al." : "")
                  : "Author information unavailable"}
              </p>

              <div className="paper-metadata">
                {paper.year && <span>Year: {paper.year}</span>}
                {paper.journal && <span>Source: {paper.journal}</span>}
                <span>
                  Citations: {(paper.citations || 0).toLocaleString()}
                </span>
              </div>

              <div className="similarity-score-block">
                <div className="similarity-score-labels">
                  <span>Cosine similarity score</span>
                  <strong>
                    {typeof paper.similarity_score === "number"
                      ? paper.similarity_score.toFixed(4)
                      : "Not available"}
                  </strong>
                </div>

                {typeof paper.similarity_score === "number" && (
                  <div className="similarity-track">
                    <div
                      className="similarity-fill"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(100, paper.similarity_score * 100)
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {paper.abstract ? (
                <p className="paper-abstract">{paper.abstract}</p>
              ) : (
                <p className="paper-abstract muted">
                  Abstract unavailable in the current search response.
                </p>
              )}

              {renderPaperActions(paper)}
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderSimilarityPage(sortedPapers) {
    return (
      <section className="ranked-papers-section">
        <div className="ranked-papers-heading">
          <div>
            <h3>Similarity Comparison</h3>
            <p className="workflow-description">
              Compare how closely each paper matches your research topic.
              Similarity is not a measure of paper quality or correctness.
            </p>
          </div>
          <span className="ranked-paper-count">
            {sortedPapers.length} papers
          </span>
        </div>

        <div className="similarity-comparison-list">
          {sortedPapers.map((paper, index) => {
            const score =
              typeof paper.similarity_score === "number"
                ? paper.similarity_score
                : null;

            const scorePercent =
              score === null
                ? null
                : Math.max(0, Math.min(100, score * 100));

            return (
              <article
                className="similarity-comparison-card"
                key={paper.id || paper.doi || `${paper.title}-${index}`}
              >
                <div className="similarity-rank">
                  {String(index + 1).padStart(2, "0")}
                </div>

                <div className="similarity-comparison-content">
                  <div className="similarity-comparison-title-row">
                    <div>
                      <h3>{paper.title || "Untitled paper"}</h3>
                      <p>
                        {paper.year || "Year unavailable"}
                        {paper.journal ? ` · ${paper.journal}` : ""}
                      </p>
                    </div>

                    <strong className="similarity-percent">
                      {scorePercent === null
                        ? "N/A"
                        : `${scorePercent.toFixed(1)}%`}
                    </strong>
                  </div>

                  {scorePercent !== null && (
                    <div
                      className="similarity-track"
                      role="progressbar"
                      aria-label={`Scaled similarity for ${
                        paper.title || "paper"
                      }`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(scorePercent)}
                    >
                      <div
                        className="similarity-fill"
                        style={{ width: `${scorePercent}%` }}
                      />
                    </div>
                  )}

                  <div className="similarity-comparison-footer">
                    <span>
                      {score === null
                        ? "Cosine similarity unavailable"
                        : `Cosine similarity: ${score.toFixed(4)}`}
                    </span>
                    <span>
                      {(paper.citations || 0).toLocaleString()} citations
                    </span>
                  </div>

                  {renderPaperActions(paper)}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  function renderResearchGapsPage() {
    const themes = gapData?.themes || [];
    const candidateGaps = gapData?.candidate_gaps || [];

    return (
      <>
        <section className="page-intro">
          <h2>Research Gaps</h2>
          <p>
            Analyze retrieved academic literature to discover recurring
            themes and candidate underexplored concepts.
          </p>
        </section>

        <section className="search-panel">
          <form onSubmit={analyzeResearchGaps}>
            <label htmlFor="gap-topic">Research topic for gap analysis</label>

            <textarea
              id="gap-topic"
              value={gapTopic}
              maxLength={500}
              onChange={(event) => setGapTopic(event.target.value)}
              placeholder="For example: machine learning for medical image diagnosis"
              rows={4}
              required
            />

            <label htmlFor="gap-paper-count">
              Number of papers to analyze
            </label>

            <select
              id="gap-paper-count"
              value={gapPerPage}
              onChange={(event) => setGapPerPage(Number(event.target.value))}
              disabled={gapsLoading}
            >
              <option value={10}>10 papers</option>
              <option value={20}>20 papers</option>
              <option value={30}>30 papers</option>
              <option value={50}>50 papers</option>
              <option value={75}>75 papers</option>
              <option value={100}>100 papers</option>
            </select>

            <div className="search-footer">
              <span>OpenAlex and TF-IDF analysis</span>
              <button type="submit" disabled={gapsLoading}>
                {gapsLoading ? "Analyzing..." : "Analyze Research Gaps"}
              </button>
            </div>
          </form>

          {gapsError && (
            <p className="search-message" role="alert">
              {gapsError}
            </p>
          )}
        </section>

        {gapsLoading && (
          <section className="workflow-panel">
            <h3>Analyzing the literature...</h3>
            <p className="workflow-description">
              Retrieving papers and processing available abstracts.
            </p>
          </section>
        )}

        {!gapsLoading && !gapData && !gapsError && (
          <section className="workflow-panel">
            <h3>Ready to analyze</h3>
            <p className="workflow-description">
              Enter a topic and run the analysis to view themes, candidate
              gaps, and supporting sources.
            </p>
            {searchedTopic && (
              <button
                type="button"
                onClick={() => setGapTopic(searchedTopic)}
              >
                Use Current Search Topic
              </button>
            )}
          </section>
        )}

        {!gapsLoading && gapData && (
          <>
            <section className="results-summary">
              <div>
                <span className="summary-label">PAPERS ANALYZED</span>
                <h3>{gapData.paper_count ?? 0}</h3>
              </div>
              <div>
                <span className="summary-label">ABSTRACTS AVAILABLE</span>
                <h3>{gapData.abstract_count ?? 0}</h3>
              </div>
              <div>
                <span className="summary-label">ABSTRACT COVERAGE</span>
                <h3>{gapData.abstract_coverage_percent ?? 0}%</h3>
              </div>
            </section>

            <section className="analysis-panel">
              <span className="analysis-label">ANALYZED RESEARCH TOPIC</span>
              <h3>{gapData.topic}</h3>
              <p>
                Provider: {gapData.provider || "OpenAlex"}
                {gapData.method ? ` · Method: ${gapData.method}` : ""}
              </p>
              {gapData.message && (
                <p className="workflow-note">{gapData.message}</p>
              )}
            </section>

            <section className="ranked-papers-section">
              <div className="ranked-papers-heading">
                <div>
                  <h3>Recurring Research Themes</h3>
                  <p className="workflow-description">
                    Concepts appearing across the retrieved paper sample.
                  </p>
                </div>
                <span className="ranked-paper-count">
                  {themes.length} themes
                </span>
              </div>

              {themes.length === 0 ? (
                <section className="workflow-panel">
                  <p>No recurring themes were returned for this topic.</p>
                </section>
              ) : (
                <div className="papers-list">
                  {themes.map((theme, index) => (
                    <article
                      className="paper-card"
                      key={`${theme.theme}-${index}`}
                    >
                      <div className="paper-card-top">
                        <span className="paper-number">
                          THEME {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="ranked-paper-count">
                          {theme.coverage_percent ?? 0}% coverage
                        </span>
                      </div>

                      <h3>{theme.theme}</h3>
                      <p className="paper-authors">
                        Mentioned in {theme.paper_count ?? 0} papers
                      </p>

                      <div
                        className="similarity-track"
                        role="progressbar"
                        aria-label={`Coverage for ${theme.theme}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.max(
                          0,
                          Math.min(100, theme.coverage_percent ?? 0)
                        )}
                      >
                        <div
                          className="similarity-fill"
                          style={{
                            width: `${Math.max(
                              0,
                              Math.min(100, theme.coverage_percent ?? 0)
                            )}%`,
                          }}
                        />
                      </div>

                      {typeof theme.mean_tfidf_weight === "number" && (
                        <p className="paper-abstract">
                          Mean TF-IDF weight:{" "}
                          {theme.mean_tfidf_weight.toFixed(4)}
                        </p>
                      )}

                      {theme.supporting_papers?.length > 0 && (
                        <div className="gap-evidence">
                          <h4>Supporting papers</h4>
                          <ul>
                            {theme.supporting_papers.map((paper, paperIndex) => (
                              <li
                                key={`${paper.url || paper.title}-${paperIndex}`}
                              >
                                {paper.url ? (
                                  <a
                                    href={paper.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {paper.title || "View source paper"}
                                  </a>
                                ) : (
                                  <span>{paper.title || "Untitled paper"}</span>
                                )}
                                {paper.year ? ` (${paper.year})` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="ranked-papers-section">
              <div className="ranked-papers-heading">
                <div>
                  <h3>Candidate Research Gaps</h3>
                  <p className="workflow-description">
                    Infrequent concepts that require further literature review.
                  </p>
                </div>
                <span className="ranked-paper-count">
                  {candidateGaps.length} candidates
                </span>
              </div>

              {candidateGaps.length === 0 ? (
                <section className="workflow-panel">
                  <h3>No candidate gaps returned</h3>
                  <p className="workflow-description">
                    Try a broader topic or analyze a larger sample. This does
                    not establish that no research gaps exist.
                  </p>
                </section>
              ) : (
                <div className="papers-list">
                  {candidateGaps.map((gap, index) => (
                    <article
                      className="paper-card"
                      key={`${gap.concept || gap.candidate}-${index}`}
                    >
                      <div className="paper-card-top">
                        <span className="paper-number">
                          CANDIDATE {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="ranked-paper-count">
                          {gap.coverage_percent ?? 0}% coverage
                        </span>
                      </div>

                      <h3>{gap.candidate || gap.concept}</h3>
                      <p className="paper-authors">
                        Concept: {gap.concept || "Not specified"} · Mentioned
                        in {gap.papers_mentioning ?? 0} papers
                      </p>
                      <p className="paper-abstract">
                        {gap.interpretation ||
                          "This concept appears infrequently in the retrieved sample and requires further verification."}
                      </p>

                      {gap.evidence?.length > 0 && (
                        <div className="gap-evidence">
                          <h4>Evidence to review</h4>
                          <ul>
                            {gap.evidence.map((paper, paperIndex) => (
                              <li
                                key={`${paper.url || paper.title}-${paperIndex}`}
                              >
                                {paper.url ? (
                                  <a
                                    href={paper.url}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {paper.title || "View source paper"}
                                  </a>
                                ) : (
                                  <span>{paper.title || "Untitled paper"}</span>
                                )}
                                {paper.year ? ` (${paper.year})` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {gapData.limitations?.length > 0 && (
              <section className="workflow-panel">
                <h3>Analysis Limitations</h3>
                <ul>
                  {gapData.limitations.map((limitation, index) => (
                    <li key={`${limitation}-${index}`}>{limitation}</li>
                  ))}
                </ul>
              </section>
            )}

            <p className="workflow-note">
              A low-frequency concept is not proof of a research gap or
              novelty. Verify candidates against broader literature and
              original papers.
            </p>

            <div className="search-footer">
              <span>Analysis complete</span>
              <button
                type="button"
                onClick={() => {
                  setGapData(null);
                  setGapsError("");
                }}
              >
                Analyze Another Topic
              </button>
            </div>
          </>
        )}
      </>
    );
  }

  function renderNoveltyPage() {
    const ideas = Array.isArray(noveltyData?.ideas)
      ? noveltyData.ideas
      : Array.isArray(noveltyData?.novelty_ideas)
        ? noveltyData.novelty_ideas
        : [];

    const limitations = Array.isArray(noveltyData?.limitations)
      ? noveltyData.limitations
      : [];

    return (
      <>
        <section className="page-intro">
          <h2>Novelty Analysis</h2>
          <p>
            Examine a proposed research direction against retrieved academic
            literature and identify candidate contributions for further review.
          </p>
        </section>

        <section className="search-panel">
          <form onSubmit={analyzeNovelty}>
            <label htmlFor="novelty-topic">
              Proposed research idea or research question
            </label>

            <textarea
              id="novelty-topic"
              value={noveltyTopic}
              maxLength={3000}
              onChange={(event) => setNoveltyTopic(event.target.value)}
              placeholder="Describe your proposed research idea, method, target problem, or research question."
              rows={5}
              required
            />

            <label htmlFor="novelty-paper-count">
              Number of papers to examine
            </label>

            <select
              id="novelty-paper-count"
              value={noveltyPerPage}
              onChange={(event) =>
                setNoveltyPerPage(Number(event.target.value))
              }
              disabled={noveltyLoading}
            >
              <option value={10}>10 papers</option>
              <option value={20}>20 papers</option>
              <option value={30}>30 papers</option>
              <option value={50}>50 papers</option>
              <option value={75}>75 papers</option>
              <option value={100}>100 papers</option>
            </select>

            <div className="search-footer">
              <span>Literature comparison and candidate analysis</span>
              <button type="submit" disabled={noveltyLoading}>
                {noveltyLoading ? "Analyzing..." : "Analyze Potential Novelty"}
              </button>
            </div>
          </form>

          {noveltyError && (
            <p className="search-message" role="alert">
              {noveltyError}
            </p>
          )}
        </section>

        {noveltyLoading && (
          <section className="workflow-panel">
            <h3>Examining related literature...</h3>
            <p className="workflow-description">
              Retrieving academic works and evaluating possible research
              directions. The first request may take longer while the language
              model is initialized.
            </p>
          </section>
        )}

        {!noveltyLoading && !noveltyData && !noveltyError && (
          <section className="workflow-panel">
            <h3>How novelty analysis works</h3>
            <div className="analysis-steps">
              {[
                "Describe the proposed research idea.",
                "Retrieve related academic papers.",
                "Compare the proposed direction with available literature.",
                "Review candidate contributions and supporting evidence.",
                "Verify originality through a broader literature review.",
              ].map((step, index) => (
                <div className="analysis-step" key={step}>
                  <span className="workflow-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
            {searchedTopic && (
              <button
                type="button"
                onClick={() => setNoveltyTopic(searchedTopic)}
              >
                Use Current Search Topic
              </button>
            )}
          </section>
        )}

        {!noveltyLoading && noveltyData && (
          <>
            <section className="results-summary">
              <div>
                <span className="summary-label">PAPERS RETRIEVED</span>
                <h3>
                  {noveltyData.paper_count ??
                    noveltyData.papers?.length ??
                    0}
                </h3>
              </div>
              <div>
                <span className="summary-label">ABSTRACTS AVAILABLE</span>
                <h3>
                  {noveltyData.abstract_count ??
                    noveltyData.papers_with_abstracts ??
                    "N/A"}
                </h3>
              </div>
              <div>
                <span className="summary-label">CANDIDATE IDEAS</span>
                <h3>{ideas.length}</h3>
              </div>
            </section>

            <section className="analysis-panel">
              <span className="analysis-label">ANALYZED RESEARCH IDEA</span>
              <h3>{noveltyData.topic || noveltyTopic}</h3>
              <p>
                Provider: {noveltyData.provider || "OpenAlex"}
                {noveltyData.method ? ` · Method: ${noveltyData.method}` : ""}
              </p>
              <p className="workflow-note">
                These are potential directions inferred from the retrieved
                sample. They are not confirmed novel contributions, and this
                analysis cannot guarantee that an idea has never been published.
              </p>
            </section>

            {ideas.length === 0 ? (
              <section className="workflow-panel">
                <h3>No candidate ideas were returned</h3>
                <p className="workflow-description">
                  Try a more specific research question or a different paper
                  sample. You can also inspect the research gaps page.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTo("gaps")}
                >
                  Open Research Gaps
                </button>
              </section>
            ) : (
              <section className="ranked-papers-section">
                <div className="ranked-papers-heading">
                  <div>
                    <h3>Potential Novelty Directions</h3>
                    <p className="workflow-description">
                      Review each candidate and its evidence before selecting
                      a research direction.
                    </p>
                  </div>
                  <span className="ranked-paper-count">
                    {ideas.length} candidates
                  </span>
                </div>

                <div className="papers-list">
                  {ideas.map((idea, index) => {
                    const title =
                      idea.title ||
                      idea.candidate ||
                      idea.idea ||
                      idea.research_direction ||
                      idea.concept ||
                      `Candidate research direction ${index + 1}`;

                    const supportingPapers =
                      idea.supporting_paper_details ||
                      idea.supporting_papers ||
                      idea.evidence ||
                      [];

                    const questions =
                      idea.research_questions ||
                      (idea.research_question
                        ? [idea.research_question]
                        : []);

                    const contribution =
                      idea.possible_contribution ||
                      idea.potential_contribution ||
                      idea.contribution ||
                      idea.rationale;

                    const verification =
                      idea.verification_needed ||
                      idea.verification_checklist ||
                      idea.next_steps ||
                      [];

                    return (
                      <article
                        className="paper-card"
                        key={`${title}-${index}`}
                      >
                        <div className="paper-card-top">
                          <span className="paper-number">
                            CANDIDATE {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="ranked-paper-count">
                            Unverified candidate
                          </span>
                        </div>

                        <h3>{title}</h3>

                        {idea.description && (
                          <p className="paper-abstract">
                            {idea.description}
                          </p>
                        )}

                        {idea.reason && (
                          <p className="paper-abstract">{idea.reason}</p>
                        )}

                        {idea.rationale && !contribution && (
                          <p className="paper-abstract">{idea.rationale}</p>
                        )}

                        {contribution && (
                          <div className="gap-evidence">
                            <h4>Possible contribution</h4>
                            <p>{contribution}</p>
                          </div>
                        )}

                        {questions.length > 0 && (
                          <div className="gap-evidence">
                            <h4>Research questions to investigate</h4>
                            <ul>
                              {questions.map((question, questionIndex) => (
                                <li key={`${question}-${questionIndex}`}>
                                  {typeof question === "string"
                                    ? question
                                    : question.question ||
                                      JSON.stringify(question)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {Array.isArray(verification) &&
                          verification.length > 0 && (
                            <div className="gap-evidence">
                              <h4>Verification checklist</h4>
                              <ul>
                                {verification.map((item, itemIndex) => (
                                  <li key={`${item}-${itemIndex}`}>
                                    {typeof item === "string"
                                      ? item
                                      : item.description ||
                                        item.task ||
                                        JSON.stringify(item)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        {typeof verification === "string" &&
                          verification.length > 0 && (
                            <div className="gap-evidence">
                              <h4>Verification needed</h4>
                              <p>{verification}</p>
                            </div>
                          )}

                        {supportingPapers.length > 0 && (
                          <div className="gap-evidence">
                            <h4>Supporting literature</h4>
                            <ul>
                              {supportingPapers.map((paper, paperIndex) => {
                                if (typeof paper === "string") {
                                  return (
                                    <li key={`${paper}-${paperIndex}`}>
                                      {paper}
                                    </li>
                                  );
                                }

                                const paperTitle =
                                  paper.title ||
                                  paper.paper_title ||
                                  "Untitled paper";

                                return (
                                  <li
                                    key={`${
                                      paper.url || paper.doi || paperTitle
                                    }-${paperIndex}`}
                                  >
                                    {paper.url ? (
                                      <a
                                        href={paper.url}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {paperTitle}
                                      </a>
                                    ) : paper.doi ? (
                                      <a
                                        href={`https://doi.org/${String(
                                          paper.doi
                                        ).replace(/^https?:\/\/doi\.org\//, "")}`}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        {paperTitle}
                                      </a>
                                    ) : (
                                      <span>{paperTitle}</span>
                                    )}
                                    {paper.year ? ` (${paper.year})` : ""}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {idea.novelty_status && (
                          <p className="workflow-note">
                            Status: {String(idea.novelty_status).replaceAll(
                              "_",
                              " "
                            )}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {limitations.length > 0 && (
              <section className="workflow-panel">
                <h3>Analysis Limitations</h3>
                <ul>
                  {limitations.map((limitation, index) => (
                    <li key={`${limitation}-${index}`}>
                      {typeof limitation === "string"
                        ? limitation
                        : limitation.description ||
                          JSON.stringify(limitation)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="workflow-panel">
              <h3>What to do next</h3>
              <p className="workflow-description">
                Read the supporting papers, search multiple scholarly sources,
                compare methods and results, and consult your supervisor before
                claiming originality.
              </p>
              <div className="search-footer">
                <button
                  type="button"
                  onClick={() => navigateTo("gaps")}
                >
                  Review Research Gaps
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoveltyData(null);
                    setNoveltyError("");
                  }}
                >
                  Analyze Another Idea
                </button>
              </div>
            </section>
          </>
        )}
      </>
    );
  }

  function renderAnalysisPage(pageId) {
    if (pageId === "gaps") {
      return renderResearchGapsPage();
    }

    if (pageId === "novelty") {
      return renderNoveltyPage();
    }

    const sortedPapers = [...papers].sort(
      (a, b) =>
        (b.similarity_score ?? -1) - (a.similarity_score ?? -1)
    );

    const isSimilarity = pageId === "similarity";

    return (
      <>
        <section className="page-intro">
          <h2>
            {isSimilarity ? "Similarity Analysis" : "Recommended Papers"}
          </h2>
          <p>
            {isSimilarity
              ? "A numbered comparison of cosine similarity scores for your retrieved papers."
              : "Explore detailed papers ranked by semantic similarity to your query."}
          </p>
        </section>

        <section className="analysis-panel">
          <span className="analysis-label">CURRENT RESEARCH TOPIC</span>
          <h3>{searchedTopic || "No topic searched yet"}</h3>
          <p>
            {searchedTopic
              ? `${papers.length.toLocaleString()} papers are currently loaded.`
              : "Search for a topic first to view recommendations and similarity scores."}
          </p>
          <button
            onClick={() => navigateTo(searchedTopic ? "results" : "search")}
          >
            {searchedTopic ? "View Retrieved Papers" : "Start a Search"}
          </button>
        </section>

        {searchMessage && (
          <p className="search-message" role="status">
            {searchMessage}
          </p>
        )}

        {searching && (
          <p className="loading-message">
            Retrieving papers and calculating similarity...
          </p>
        )}

        {sortedPapers.length > 0 &&
          (isSimilarity
            ? renderSimilarityPage(sortedPapers)
            : renderRecommendedPage(sortedPapers))}

        {!searching && sortedPapers.length === 0 && (
          <section className="workflow-panel">
            <h3>Start with a research search</h3>
            <p className="workflow-description">
              Search for a topic first. Your returned papers will appear here.
            </p>
            <button onClick={() => navigateTo("search")}>
              Go to Research Search
            </button>
          </section>
        )}

        {hasMore && sortedPapers.length > 0 && (
          <div className="load-more-container">
            <button
              className="load-more-button"
              onClick={loadMore}
              disabled={loadingMore || searching}
            >
              {loadingMore ? "Loading..." : "Load More Papers"}
            </button>
          </div>
        )}
      </>
    );
  }

  const pageTitles = {
    search: "Research Search",
    results: "Scholar Results",
    recommended: "Recommended",
    similarity: "Similarity",
    gaps: "Research Gaps",
    novelty: "Novelty Analysis",
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h2>
            CLOUD BASED AI RESEARCH PAPER RECOMMENDATION ENGINE WITH RESEARCH
            NOVELTY ANALYSIS
          </h2>
          <p>Paper recommendation &amp; novelty analysis</p>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-link ${
                activePage === item.id ? "active" : ""
              }`}
              onClick={() => navigateTo(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <p>
            Query → Academic Search → Embeddings → Cosine Similarity → Ranking
            → Research Gaps → Potential Novelty
          </p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">RESEARCH WORKSPACE</p>
            <h1>{pageTitles[activePage]}</h1>
          </div>

          <div className="connection-status">
            <span
              className={`status-dot ${
                backendStatus === "Connected" ? "online" : ""
              }`}
            />
            Backend: {backendStatus}
          </div>
        </header>

        {activePage === "search" && renderSearchPage()}
        {activePage === "results" && renderResultsPage()}
        {["recommended", "similarity", "gaps", "novelty"].includes(activePage) &&
          renderAnalysisPage(activePage)}

        <footer className="page-footer">
          <span>ResearchCloud</span>
          <span>Academic search provider: OpenAlex</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
