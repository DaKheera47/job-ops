# UK Visa Jobs Extractor

Fetches job listings from [my.ukvisajobs.com](https://my.ukvisajobs.com) that may sponsor work visas.

## Setup

```bash
npm install
```

## Configuration

Set the following environment variables (you can get these from your browser's dev tools after logging in):

| Variable | Description |
|----------|-------------|
| `UKVISAJOBS_TOKEN` | JWT token from the request body (required) |
| `UKVISAJOBS_AUTH_TOKEN` | Auth cookie token (defaults to UKVISAJOBS_TOKEN) |
| `UKVISAJOBS_CSRF_TOKEN` | CSRF token from cookies |
| `UKVISAJOBS_CI_SESSION` | CI session ID from cookies |
| `UKVISAJOBS_MAX_JOBS` | Maximum jobs to fetch (default: 50, max: 200) |
| `UKVISAJOBS_SEARCH_KEYWORD` | Optional search filter |

## How to get tokens

1. Log into `my.ukvisajobs.com` in your browser
2. Open Developer Tools → Network tab
3. Navigate to the jobs page
4. Find the `fetch-jobs-data` POST request
5. Copy values:
   - From **Request Body**: copy the `token` field → `UKVISAJOBS_TOKEN`
   - From **Cookies**: copy `authToken`, `csrf_token`, `ci_session`

## Running

```bash
npm start
```

Output is written to `storage/datasets/default/` as JSON files.
