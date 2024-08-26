import { useState } from 'react';
import { Octokit } from '@octokit/core';

import './App.css';

const EXTENSIONS_TO_EXCLUDE = ['.lock', '.tmp', '.bak'];

/**
 * Converts a GitHub URL to API URL parameters.
 * @param {string} url - The GitHub URL to convert.
 * @returns {{ user: string; repo: string; prNumber: number }} - The converted parameters.
 * @throws {Error} - Throws an error if the URL format is incorrect.
 */
const convertUrlToApiUrl = (url: string): { user: string; repo: string; prNumber: number } => {
  const regex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)\/files/;
  const matches = url.match(regex);

  if (matches) {
    const [_, user, repo, prNumber] = matches;
    return { user, repo, prNumber: parseInt(prNumber, 10) };
  } else {
    throw new Error("URL format is incorrect");
  }
};

/**
 * Fetches the content of a file from GitHub.
 * @param {string} contentsUrl - The URL to fetch the file content from.
 * @returns {Promise<string>} - The decoded file content.
 */
const fetchFileContent = async (contentsUrl: string): Promise<string> => {
  const response = await fetch(contentsUrl);
  const data = await response.json();
  const fileString = data.content;
  return atob(fileString); // Decode base64 content
};

/**
 * Retrieves files from the GitHub API for a given pull request.
 * @param {string} tabUrl - The URL of the pull request.
 * @returns {Promise<any[]>} - A list of files in the pull request.
 */
const getFilesFromApi = async (tabUrl: string): Promise<any[]> => {
  const { user, repo, prNumber } = convertUrlToApiUrl(tabUrl);
  const apiUrl = `https://api.github.com/repos/${user}/${repo}/pulls/${prNumber}/files`;
  const response = await fetch(apiUrl);
  return response.json();
};

const App = () => {
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [octokit, setOctokit] = useState<any>(null);
  const [llmApiKey, setLlmApiKey] = useState<string>("");



  /**
   * Processes the files by fetching their content, getting GPT response, and posting comments.
   * @param {any[]} files - The list of files to process.
   * @param {string} tabUrl - The URL of the pull request.
   */
  const processFiles = async (files: any[], tabUrl: string) => {
    for (const item of files) {
      try {
        const decodedContent = await fetchFileContent(item.contents_url);
        const { user, repo, prNumber } = convertUrlToApiUrl(tabUrl);

        const gptResponse = await callGptApi(decodedContent);
        const commentBody = gptResponse?.choices?.[0]?.message?.content || '';

        if (commentBody) {
          console.log(octokit)
          await octokit.request(`POST /repos/${user}/${repo}/pulls/${prNumber}/comments`, {
            commit_id: "f36b14707cd115d3765551d8976e9664cf74bbd3", // Use the actual commit ID from the file
            body: commentBody,
            path: item.filename,
            line: 13, // Consider dynamic line number calculation
            side: 'RIGHT',
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          });
        }
      } catch (error) {
        console.error('Error processing file:', error);
        setReviewStatus('Error occurred while processing files.');
      }
    }
    setReviewStatus('Review comments added successfully.');
  };

  /**
   * Initiates the review process by querying the active tab and processing files.
   */
  const startReview = async () => {
    try {
      setIsLoading(true);
      const [tab] = await chrome.tabs.query({ active: true });
      if (tab.url) {
        const files = await getFilesFromApi(tab.url);

        // Filter out files with excluded extensions
        const filteredFiles = files.filter((file: any) => {
          const extension = file.filename.slice(((file.filename.lastIndexOf(".") - 1) >>> 0) + 2);
          return !EXTENSIONS_TO_EXCLUDE.includes(`.${extension}`);
        });
        await processFiles(filteredFiles, tab.url);
      } else {
        setReviewStatus('No active tab URL found.');
      }
    } catch (error) {
      console.error('Error:', error);
      setReviewStatus('Error occurred while fetching files.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Calls the GPT API to get a review comment.
   * @param {string} decodedContent - The content of the file to review.
   * @returns {Promise<any>} - The response from the GPT API.
   */
  const callGptApi = async (decodedContent: string): Promise<any> => {
    const gptUrl = 'https://api.aimlapi.com/chat/completions';
    const requestData = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `Review the following file in PR as a senior software engineer and write the appropriate review comment (Only write the comment and no extra text): ${decodedContent}`
        }
      ],
      max_tokens: 1000,
      stream: false
    };
    try {
      const response = await fetch(gptUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${llmApiKey}`, // Replace with your actual API key
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });
      return response.json();

    } catch (error) {
      setReviewStatus("An error occurred while fetching AI response.")
    }
  };


  return (
    <>
      <div className="card">
        <div>
          <label htmlFor="githubKey">GitHub API Key</label>
          <input
            id="githubKey"
            type="password"
            onChange={(e) => {
              console.log(e.target.value)
              setOctokit(new Octokit({
                auth: e.target.value
              }))
            }}
            placeholder="Enter GitHub API Key"
          />
        </div>
        <div>
          <label htmlFor="llmApiKey">GPT API Key</label>
          <input
            id="llmApiKey"
            type="password"
            onChange={(e) => setLlmApiKey(e.target.value)}
            placeholder="Enter GPT API Key"
          />
        </div>
        <button onClick={startReview} disabled={isLoading}>
          {isLoading ? "Adding review comments..." : "Start Review"}
        </button>
        <p>{reviewStatus}</p>
      </div>
    </>
  );
};

export default App;
