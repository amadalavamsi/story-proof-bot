import axios from 'axios';
import * as core from '@actions/core';
import { JiraClient } from '../src/jira-client';

jest.mock('axios');
jest.mock('@actions/core');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('JiraClient', () => {
  const baseUrl = 'https://myorg.atlassian.net';
  const email = 'user@example.com';
  const token = 'secret-token';
  let client: JiraClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new JiraClient(baseUrl, email, token);
  });

  describe('Authorization header & Issue fetching', () => {
    it('fetches story and uses Basic auth correctly', async () => {
      const mockStoryData = {
        data: {
          fields: {
            summary: 'User Authentication Flow',
            description: 'Acceptance Criteria:\n- User can log in with email and password\n- Invalid password shows error message',
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockStoryData);

      const result = await client.getStory('PROJ-123');

      const expectedAuth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://myorg.atlassian.net/rest/api/3/issue/PROJ-123',
        {
          headers: {
            Authorization: expectedAuth,
            Accept: 'application/json',
          },
        },
      );

      expect(result.title).toBe('User Authentication Flow');
      expect(result.acs).toEqual([
        { id: 'AC-1', text: 'User can log in with email and password' },
        { id: 'AC-2', text: 'Invalid password shows error message' },
      ]);
    });
  });

  describe('Acceptance Criteria Extraction', () => {
    it('extracts ACs from dedicated custom field (string or ADF)', async () => {
      const mockStoryData: { data: { fields: Record<string, unknown> } } = {
        data: {
          fields: {
            summary: 'Search Products',
            customfield_acceptance_criteria: {
              type: 'doc',
              content: [
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'text', text: 'Search by keyword should return matching products' }],
                    },
                    {
                      type: 'listItem',
                      content: [{ type: 'text', text: 'Search results support pagination' }],
                    },
                  ],
                },
              ],
            },
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockStoryData);

      const result = await client.getStory('PROJ-456');

      expect(result.title).toBe('Search Products');
      expect(result.acs).toHaveLength(2);
      expect(result.acs[0]).toEqual({
        id: 'AC-1',
        text: 'Search by keyword should return matching products',
      });
      expect(result.acs[1]).toEqual({
        id: 'AC-2',
        text: 'Search results support pagination',
      });
    });

    it('extracts ACs from description Acceptance Criteria section with headings and numbered items', async () => {
      const mockStoryData = {
        data: {
          fields: {
            summary: 'Password Reset',
            description: [
              'Background:',
              'Some background information.',
              '',
              'Acceptance Criteria:',
              '1. User receives email with reset link',
              '2. Token expires after 15 minutes',
              'AC-3: User can set new password',
              '',
              'Out of Scope',
              '- SMS verification',
            ].join('\n'),
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockStoryData);

      const result = await client.getStory('PROJ-789');

      expect(result.acs).toEqual([
        { id: 'AC-1', text: 'User receives email with reset link' },
        { id: 'AC-2', text: 'Token expires after 15 minutes' },
        { id: 'AC-3', text: 'User can set new password' },
      ]);
    });

    it('falls back to all bullet points in description when no AC heading is present', async () => {
      const mockStoryData = {
        data: {
          fields: {
            summary: 'Export Report to CSV',
            description: `
Here are the general requirements:
* Export button downloads CSV file
* All filter parameters must be respected in export
* Notify user if export exceeds 1000 rows
            `,
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockStoryData);

      const result = await client.getStory('PROJ-101');

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('No dedicated AC section found'),
      );
      expect(result.acs).toEqual([
        { id: 'AC-1', text: 'Export button downloads CSV file' },
        { id: 'AC-2', text: 'All filter parameters must be respected in export' },
        { id: 'AC-3', text: 'Notify user if export exceeds 1000 rows' },
      ]);
    });

    it('returns empty array if no description or AC fields are present', async () => {
      const mockStoryData = {
        data: {
          fields: {
            summary: 'Empty Story',
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockStoryData);

      const result = await client.getStory('PROJ-000');

      expect(result.acs).toEqual([]);
    });

    it('handles Atlassian Document Format (ADF) nodes correctly', async () => {
      const mockStoryData = {
        data: {
          fields: {
            summary: 'ADF Story',
            description: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  content: [{ type: 'text', text: 'Acceptance Criteria' }],
                },
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'AC-1: First item' },
                    { type: 'hardBreak' },
                    { type: 'text', text: 'AC-2: Second item' },
                  ],
                },
              ],
            },
          },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockStoryData);

      const result = await client.getStory('PROJ-202');

      expect(result.acs).toEqual([
        { id: 'AC-1', text: 'First item' },
        { id: 'AC-2', text: 'Second item' },
      ]);
    });
  });
});
