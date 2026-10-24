
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Page = "overview" | "reviews" | "findings" | "analytics";
type Theme = "dark" | "light";

type Finding = {
  id: string;
  filePath: string;
  lineNumber: number | null;
  severity: Severity;
  category: string;
  message: string;
  suggestion: string | null;
};

type Review = {
  id: string;
  status: string;
  summary: string | null;
  createdAt: string;
  commitSha?: string | null;
  githubPostedAt?: string | null;
  githubPostError?: string | null;
  findings: Finding[];
  pullRequest: {
    number: number;
    title: string;
    url: string;
    repository: {
      fullName: string;
    };
  };
};

type GitHubPull = {
  number: number;
  title: string;
  url: string;
  state: string;
};

const SEVERITIES: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
];

const NAV_ITEMS: { id: Page; icon: string; label: string }[] = [
  { id: "overview", icon: "▦", label: "Overview" },
  { id: "reviews", icon: "◈", label: "AI Reviews" },
  { id: "findings", icon: "◎", label: "Findings Explorer" },
  { id: "analytics", icon: "▥", label: "Analytics" },
];

function getInitialTheme(): Theme {
  try {
    return localStorage.getItem("codepilot-theme") === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "Request timed out. Please try again.";
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}

async function fetchJSON(
  url: string,
  options: RequestInit = {},
  timeout = 15000
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message ||
          data.error ||
          `Request failed with status ${response.status}`
      );
    }

    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

function SkeletonDashboard() {
  return (
    <div className="skeleton-dashboard" aria-label="Loading dashboard">
      <div className="skeleton skeleton-banner" />
      <div className="stats-grid">
        {[1, 2, 3, 4].map((item) => (
          <div className="skeleton skeleton-stat" key={item} />
        ))}
      </div>
      <div className="analytics-grid">
        <div className="skeleton skeleton-panel" />
        <div className="skeleton skeleton-panel" />
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [page, setPage] = useState<Page>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [pulls, setPulls] = useState<GitHubPull[]>([]);
  const [selectedPR, setSelectedPR] = useState("");
  const [loadingPulls, setLoadingPulls] = useState(true);
  const [pullError, setPullError] = useState("");

  const [runningReview, setRunningReview] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [reviewError, setReviewError] = useState("");

  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<"ALL" | Severity>("ALL");
  const [sort, setSort] = useState("newest");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadReviews = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const data = await fetchJSON("/api/reviews");

      if (!Array.isArray(data.reviews)) {
        throw new Error("Invalid reviews API response.");
      }

      setReviews(data.reviews);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadPulls = useCallback(async () => {
    setLoadingPulls(true);
    setPullError("");

    try {
      const data = await fetchJSON("/api/github/pulls");

      if (!Array.isArray(data.pulls)) {
        throw new Error("Invalid GitHub API response.");
      }

      const fetched: GitHubPull[] = data.pulls;
      setPulls(fetched);

      setSelectedPR((current) => {
        if (fetched.some((pull) => String(pull.number) === current)) {
          return current;
        }

        return fetched[0] ? String(fetched[0].number) : "";
      });
    } catch (err) {
      setPullError(getErrorMessage(err));
    } finally {
      setLoadingPulls(false);
    }
  }, []);

  useEffect(() => {
    void loadReviews();
    void loadPulls();
  }, [loadReviews, loadPulls]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      localStorage.setItem("codepilot-theme", theme);
    } catch {
      // Browser storage may be unavailable.
    }
  }, [theme]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const allFindings = useMemo(
    () => reviews.flatMap((review) => review.findings),
    [reviews]
  );

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    for (const finding of allFindings) {
      if (finding.severity in counts) {
        counts[finding.severity]++;
      }
    }

    return counts;
  }, [allFindings]);

  const completedReviews = reviews.filter(
    (review) => review.status === "COMPLETED"
  ).length;

  const uniqueRepos = new Set(
    reviews.map((review) => review.pullRequest.repository.fullName)
  ).size;

  const filteredReviews = useMemo(() => {
    const query = search.trim().toLowerCase();

    return reviews
      .map((review) => {
        const textMatchesReview =
          !query ||
          [
            review.pullRequest.title,
            review.pullRequest.repository.fullName,
            review.summary ?? "",
            String(review.pullRequest.number),
          ].some((value) => value.toLowerCase().includes(query));

        const findings = review.findings.filter((finding) => {
          const severityMatches =
            severity === "ALL" || finding.severity === severity;

          const textMatches =
            !query ||
            textMatchesReview ||
            [
              finding.filePath,
              finding.category,
              finding.message,
              finding.suggestion ?? "",
            ].some((value) => value.toLowerCase().includes(query));

          return severityMatches && textMatches;
        });

        const matches =
          (severity === "ALL" && textMatchesReview) ||
          findings.length > 0;

        return { ...review, findings, matches };
      })
      .filter((review) => review.matches)
      .sort((a, b) => {
        if (sort === "most-findings") {
          return b.findings.length - a.findings.length;
        }

        const diff =
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime();

        return sort === "oldest" ? -diff : diff;
      });
  }, [reviews, search, severity, sort]);

  const visibleFindings = filteredReviews.reduce(
    (sum, review) => sum + review.findings.length,
    0
  );

  const selectedPull = pulls.find(
    (pull) => String(pull.number) === selectedPR
  );

  function navigate(next: Page) {
    setPage(next);
    setSidebarOpen(false);
    setSearch("");
    setSeverity("ALL");
  }

  function toggleFinding(id: string) {
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  async function copyFix(finding: Finding) {
    if (!finding.suggestion) return;

    try {
      await navigator.clipboard.writeText(finding.suggestion);
      setCopiedId(finding.id);
    } catch {
      setReviewError("Could not copy the suggested fix.");
    }
  }

  async function runReview() {
    const pullNumber = Number(selectedPR);

    if (
      runningReview ||
      !Number.isSafeInteger(pullNumber) ||
      pullNumber <= 0 ||
      !pulls.some((pull) => pull.number === pullNumber)
    ) {
      if (!runningReview) {
        setReviewError("Please select a valid pull request.");
      }
      return;
    }

    setRunningReview(true);
    setReviewError("");
    setReviewSuccess("");

    try {
      const data = await fetchJSON(
        "/api/reviews/run",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pullNumber }),
        },
        120000
      );

      setReviewSuccess(
        `PR #${pullNumber} reviewed successfully. ${
          data.totalFindings ?? 0
        } finding(s) recorded.`
      );

      await loadReviews(true);
      setPage("reviews");
      setSearch("");
      setSeverity("ALL");
    } catch (err) {
      setReviewError(getErrorMessage(err));
    } finally {
      setRunningReview(false);
    }
  }

  const apiIssue = Boolean(error || pullError);

  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="brand">
          <div className="brand-logo">{"</>"}</div>
          <div>
            <strong>CodePilot AI</strong>
            <span>Developer Intelligence</span>
          </div>
        </div>

        <p className="sidebar-section">WORKSPACE</p>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "findings" && (
                <span className="nav-count">{allFindings.length}</span>
              )}
            </button>
          ))}
        </nav>

        <p className="sidebar-section sidebar-section-two">EXTERNAL</p>

        <a
          className="nav-item"
          href="https://github.com/ANSHIKARAJ111/IntelliTrust-FinGuard"
          target="_blank"
          rel="noreferrer"
        >
          <span className="nav-icon">◇</span>
          <span>GitHub Repository ↗</span>
        </a>

        <div className="sidebar-footer">
          <div className="api-status">
            <span
              className={`status-dot ${apiIssue ? "offline" : ""}`}
            />
            <div>
              <strong>
                {apiIssue
                  ? "API Issue"
                  : loading || loadingPulls
                    ? "Connecting..."
                    : "API Connected"}
              </strong>
              <small>Express · PostgreSQL · GitHub</small>
            </div>
          </div>
          <p className="sidebar-version">CodePilot AI · v2.1</p>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="content">
        <header className="header">
          <div className="header-left">
            <button
              type="button"
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>

            <div>
              <p className="breadcrumb">Workspace / {page}</p>
              <h1>
                {page === "overview" && "Dashboard Overview"}
                {page === "reviews" && "AI Code Reviews"}
                {page === "findings" && "Findings Explorer"}
                {page === "analytics" && "Review Analytics"}
              </h1>
              <p className="page-description">
                Intelligent insights for cleaner, safer code.
              </p>
            </div>
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="Toggle dark and light mode"
              title="Toggle theme"
              onClick={() =>
                setTheme((current) =>
                  current === "dark" ? "light" : "dark"
                )
              }
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>

            <button
              type="button"
              className="primary-btn"
              disabled={refreshing}
              onClick={() => void loadReviews(true)}
            >
              {refreshing ? "◌ Refreshing..." : "↻ Refresh Data"}
            </button>
          </div>
        </header>

        <section className="run-review-panel">
          <div className="run-review-info">
            <div className="run-review-icon">✦</div>
            <div>
              <h3>Run AI Code Review</h3>
              <p>
                Select a GitHub pull request and analyze its code using
                Gemini AI.
              </p>
              <span className="run-review-repo">
                ◇ ANSHIKARAJ111 / IntelliTrust-FinGuard
              </span>
            </div>
          </div>

          <div className="run-review-controls">
            <label htmlFor="github-pr-select">
              GitHub Pull Request
            </label>

            <select
              id="github-pr-select"
              className="github-pr-select"
              value={selectedPR}
              disabled={loadingPulls || runningReview}
              onChange={(event) => {
                setSelectedPR(event.target.value);
                setReviewError("");
                setReviewSuccess("");
              }}
            >
              {loadingPulls ? (
                <option value="">Loading PRs...</option>
              ) : pulls.length === 0 ? (
                <option value="">No open PRs found</option>
              ) : (
                pulls.map((pull) => (
                  <option
                    value={String(pull.number)}
                    key={pull.number}
                  >
                    #{pull.number} — {pull.title}
                  </option>
                ))
              )}
            </select>

            <button
              type="button"
              className="refresh-pr-btn"
              disabled={loadingPulls || runningReview}
              onClick={() => void loadPulls()}
            >
              {loadingPulls ? "Loading..." : "↻ Refresh PRs"}
            </button>

            <button
              type="button"
              className="run-review-button"
              disabled={
                runningReview ||
                loadingPulls ||
                !selectedPull
              }
              onClick={() => void runReview()}
            >
              {runningReview ? (
                <>
                  <span className="button-spinner" />
                  Analyzing...
                </>
              ) : (
                "✦ Run AI Review"
              )}
            </button>
          </div>

          {selectedPull && (
            <div className="selected-pr-info">
              <span className="pr-open-badge">
                ● {selectedPull.state.toUpperCase()}
              </span>
              <span>
                PR #{selectedPull.number}: {selectedPull.title}
              </span>
              <a
                href={selectedPull.url}
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub ↗
              </a>
            </div>
          )}

          {pullError && (
            <div className="review-error" role="alert">
              Unable to load pull requests: {pullError}
              <button
                type="button"
                className="inline-retry-btn"
                onClick={() => void loadPulls()}
              >
                Retry
              </button>
            </div>
          )}

          {runningReview && (
            <div className="review-progress" role="status">
              <span className="loading-spinner" />
              <span>
                Analyzing PR #{selectedPR}. Gemini is reviewing the
                changed code and saving the findings.
              </span>
            </div>
          )}

          {reviewSuccess && (
            <div className="review-success" role="status">
              ✓ {reviewSuccess}
            </div>
          )}

          {reviewError && (
            <div className="review-error" role="alert">
              {reviewError}
            </div>
          )}
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span>Could not fetch reviews: {error}</span>
            <button
              type="button"
              onClick={() => void loadReviews(true)}
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <SkeletonDashboard />
        ) : (
          <>
            {(page === "overview" || page === "analytics") && (
              <>
                <section className="welcome-banner">
                  <div>
                    <span className="welcome-tag">
                      ✦ AI-POWERED CODE INTELLIGENCE
                    </span>
                    <h2>Review smarter. Ship with confidence.</h2>
                    <p>
                      Track pull requests, discover potential issues,
                      and explore Gemini-powered code insights.
                    </p>
                    <button
                      type="button"
                      className="banner-btn"
                      onClick={() => navigate("reviews")}
                    >
                      Explore AI Reviews →
                    </button>
                  </div>
                  <div className="banner-art" aria-hidden="true">
                    {"{ AI }"}
                  </div>
                </section>

                <section className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon purple">◈</div>
                    <span>Total Reviews</span>
                    <strong>{reviews.length}</strong>
                    <small>All review runs</small>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon blue">◎</div>
                    <span>Total Findings</span>
                    <strong>{allFindings.length}</strong>
                    <small>AI-detected potential issues</small>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon red">!</div>
                    <span>High Priority</span>
                    <strong>
                      {severityCounts.HIGH + severityCounts.CRITICAL}
                    </strong>
                    <small>High + critical findings</small>
                  </div>

                  <div className="stat-card">
                    <div className="stat-icon green">✓</div>
                    <span>Completed Reviews</span>
                    <strong>{completedReviews}</strong>
                    <small>{uniqueRepos} repositories analyzed</small>
                  </div>
                </section>

                <section className="analytics-grid">
                  <div className="panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Severity Distribution</h3>
                        <p>Breakdown of AI-detected findings</p>
                      </div>
                      <span className="panel-tag">LIVE DATA</span>
                    </div>

                    <div className="severity-chart">
                      {SEVERITIES.map((level) => {
                        const count = severityCounts[level];
                        const percentage = allFindings.length
                          ? (count / allFindings.length) * 100
                          : 0;

                        return (
                          <div className="chart-row" key={level}>
                            <span>{level}</span>
                            <div className="chart-track">
                              <div
                                className={`chart-fill chart-${level.toLowerCase()}`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <strong>{count}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="panel insights-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Review Health</h3>
                        <p>Overview of processed analyses</p>
                      </div>
                    </div>

                    <div className="health-circle">
                      <strong>
                        {reviews.length
                          ? Math.round(
                              (completedReviews / reviews.length) * 100
                            )
                          : 0}
                        %
                      </strong>
                      <span>Completed</span>
                    </div>

                    <p className="health-description">
                      {completedReviews} of {reviews.length} reviews
                      completed successfully.
                    </p>
                  </div>
                </section>
              </>
            )}

            {(page === "overview" ||
              page === "reviews" ||
              page === "findings") && (
              <section className="reviews-section">
                <div className="section-top">
                  <div>
                    <h2>
                      {page === "findings"
                        ? "Explore AI Findings"
                        : "Recent AI Reviews"}
                    </h2>
                    <p>
                      Search, filter, and inspect real GitHub code
                      reviews.
                    </p>
                  </div>
                  <span className="result-count">
                    {filteredReviews.length} reviews · {visibleFindings} findings
                  </span>
                </div>

                <div className="toolbar">
                  <div className="search-wrap">
                    <span aria-hidden="true">⌕</span>
                    <input
                      aria-label="Search code reviews"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search PR, repository, issue..."
                    />
                  </div>

                  <select
                    aria-label="Filter by severity"
                    value={severity}
                    onChange={(event) =>
                      setSeverity(
                        event.target.value as "ALL" | Severity
                      )
                    }
                  >
                    <option value="ALL">All Severities</option>
                    {SEVERITIES.map((level) => (
                      <option value={level} key={level}>
                        {level}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Sort reviews"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="most-findings">Most Findings</option>
                  </select>
                </div>

                {filteredReviews.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">⌕</div>
                    <h3>No matching reviews found</h3>
                    <p>
                      {reviews.length === 0
                        ? "No reviews yet. Select a PR and run AI analysis."
                        : "Try changing your search or severity filter."}
                    </p>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setSearch("");
                        setSeverity("ALL");
                      }}
                    >
                      Clear Filters
                    </button>
                  </div>
                ) : (
                  <div className="review-list">
                    {filteredReviews.map((review) => (
                      <article className="review-card" key={review.id}>
                        <div className="review-top">
                          <div>
                            <div className="repo-label">
                              ◇ {review.pullRequest.repository.fullName}
                            </div>
                            <h3>
                              PR #{review.pullRequest.number} —{" "}
                              {review.pullRequest.title}
                            </h3>
                            <div className="review-meta">
                              <span>◷ {formatDate(review.createdAt)}</span>
                              <span>·</span>
                              <span>
                                {review.findings.length} matching findings
                              </span>
                            </div>
                          </div>

                          <span
                            className={`status-badge ${
                              review.status === "COMPLETED"
                                ? "completed"
                                : "other"
                            }`}
                          >
                            ● {review.status}
                          </span>
                        </div>

                        {review.githubPostedAt && (
                          <div className="publishing-status published">
                            ✓ Published to GitHub
                          </div>
                        )}

                        {review.status === "COMPLETED" &&
                          review.githubPostedAt === null && (
                            <div className="publishing-status pending">
                              ◷ GitHub publishing pending
                              {review.githubPostError
                                ? ` — ${review.githubPostError}`
                                : ""}
                            </div>
                          )}

                        {review.summary && (
                          <div className="review-summary">
                            <strong>✦ AI Summary</strong>
                            <p>{review.summary}</p>
                          </div>
                        )}

                        {review.findings.length === 0 ? (
                          <p className="no-findings">
                            No matching findings for this review.
                          </p>
                        ) : (
                          <div className="finding-list">
                            {review.findings.map((finding) => {
                              const isExpanded = expanded.includes(finding.id);

                              return (
                                <div className="finding-card" key={finding.id}>
                                  <button
                                    type="button"
                                    className="finding-trigger"
                                    aria-expanded={isExpanded}
                                    onClick={() => toggleFinding(finding.id)}
                                  >
                                    <span className="finding-main">
                                      <span
                                        className={`severity-badge severity-${finding.severity.toLowerCase()}`}
                                      >
                                        {finding.severity}
                                      </span>
                                      <span className="finding-category">
                                        {finding.category}
                                      </span>
                                    </span>
                                    <span className="expand-icon">
                                      {isExpanded ? "−" : "+"}
                                    </span>
                                  </button>

                                  <div className="file-info">
                                    <span>⌁ {finding.filePath}</span>
                                    {finding.lineNumber !== null && (
                                      <span>Line {finding.lineNumber}</span>
                                    )}
                                  </div>

                                  <p className="finding-message">
                                    {finding.message}
                                  </p>

                                  {isExpanded && (
                                    <div className="expanded-finding">
                                      <div className="suggestion-heading">
                                        <strong>✦ AI Suggested Fix</strong>
                                        {finding.suggestion && (
                                          <button
                                            type="button"
                                            className="copy-btn"
                                            onClick={() => void copyFix(finding)}
                                          >
                                            {copiedId === finding.id
                                              ? "✓ Copied"
                                              : "⧉ Copy Fix"}
                                          </button>
                                        )}
                                      </div>
                                      <p>
                                        {finding.suggestion ||
                                          "No specific fix suggested."}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="review-bottom">
                          <span>
                            Commit: {review.commitSha?.slice(0, 7) || "—"}
                          </span>
                          <a
                            href={review.pullRequest.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View Pull Request ↗
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {page === "analytics" && (
              <section className="panel analytics-extra">
                <h3>Code Review Insights</h3>
                <p>
                  CodePilot AI has analyzed {reviews.length} review
                  runs across {uniqueRepos} repositories and identified{" "}
                  {allFindings.length} potential code issues.
                </p>
                <p>
                  High and critical findings:{" "}
                  {severityCounts.HIGH + severityCounts.CRITICAL}.
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
