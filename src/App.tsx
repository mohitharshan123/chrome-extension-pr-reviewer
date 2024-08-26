//@ts-nocheck
import { useState } from 'react';
import reactLogo from './assets/react.svg';
import viteLogo from '/vite.svg';
import './App.css';
import { Octokit } from '@octokit/core';

// Initialize Octokit instance with personal access token
const octokit = new Octokit({
  auth: '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'
});

// Convert GitHub URL to API URL parameters
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

// Fetch file content from GitHub
const fetchFileContent = async (contentsUrl: string): Promise<string> => {
  const response = await fetch(contentsUrl);
  const data = await response.json();
  const fileString = data.content;
  return atob(fileString); // Decode base64 content
};

// Call GPT API to get review comment
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
    max_tokens: 512,
    stream: false
  };

  const response = await fetch(gptUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer deeb610fa3b84a9babb3eb7ac70bc813`, // Replace with your actual API key
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  });

  return response.json();
};

// Get files from GitHub API
const getFilesFromApi = async (tabUrl: string): Promise<any[]> => {
  const { user, repo, prNumber } = convertUrlToApiUrl(tabUrl);

  const apiUrl = `https://api.github.com/repos/${user}/${repo}/pulls/${prNumber}/files`;
  const response = await fetch(apiUrl);
  return response.json();
};

// Main App component
const App = () => {
  const [count, setCount] = useState<number>(0);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);

  // Process files by fetching content, getting GPT response, and posting comments
  const processFiles = async (files: any[], tabUrl: string) => {
    for (const item of files) {
      try {
        const decodedContent = await fetchFileContent(item.contents_url);
        const { user, repo, prNumber } = convertUrlToApiUrl(tabUrl);

        const gptResponse = await callGptApi(decodedContent);
        const commentBody = gptResponse?.choices?.[0]?.message?.content || '';

        if (commentBody) {
          await octokit.request(`POST /repos/${user}/${repo}/pulls/${prNumber}/comments`, {
            commit_id: "7154996b43ed5a38005dc6eb91d20b65594c982c",
            body: commentBody,
            path: item.filename,
            line: 2,
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

  // Handle button click to start review
  const startReview = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true });
      if (tab.url) {
        const files = await getFilesFromApi(tab.url);
        await processFiles(files, tab.url);
      } else {
        setReviewStatus('No active tab URL found.');
      }
    } catch (error) {
      console.error('Error:', error);
      setReviewStatus('Error occurred while fetching files.');
    }
  };

  return (
    <>
      <div className="card">
        <button onClick={startReview}>
          Start Review
        </button>
        <p>{reviewStatus}</p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
};

export default App;
