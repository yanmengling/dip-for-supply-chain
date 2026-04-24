/**
 * API Integration Test Utilities
 *
 * Simple test functions to verify Agent API integration
 */

import { agentApiClient } from '../services/agentApi';
import type { StreamMessage } from '../types/ontology';

/**
 * Test basic API connectivity
 */
export async function testApiConnectivity(): Promise<boolean> {
  try {
    // Test with a simple debug call (you can replace this with your actual agent setup)
    const result = await agentApiClient.debugAgent({
      agent_id: 'test_agent',
      input: {
        query: 'Hello, this is a test message',
        temp_files: [],
        history: [],
        tool: {},
        custom_querys: {}
      },
      chat_mode: 'normal'
    });

    console.log('API Connectivity Test Result:', result);
    return true;
  } catch (error) {
    console.error('API Connectivity Test Failed:', error);
    return false;
  }
}

/**
 * Test streaming response
 */
export async function testStreamingResponse(): Promise<boolean> {
  try {
    let receivedMessages = 0;
    let streamEnded = false;

    await agentApiClient.chatCompletionStream(
      {
        agent_id: 'test_agent',
        query: 'Please provide a brief response for testing',
        stream: true,
        inc_stream: true
      },
      (message: StreamMessage) => {
        console.log('Received stream message:', message);
        receivedMessages++;

        if (message.type === 'end') {
          streamEnded = true;
        }
      }
    );

    console.log(`Streaming test completed. Received ${receivedMessages} messages, stream ended: ${streamEnded}`);
    return receivedMessages > 0 && streamEnded;
  } catch (error) {
    console.error('Streaming Response Test Failed:', error);
    return false;
  }
}

/**
 * Test conversation management
 */
export async function testConversationManagement(): Promise<boolean> {
  try {
    // Test getting conversations
    const conversations = await agentApiClient.getConversations(1, 10);
    console.log('Conversations retrieved:', conversations.conversations.length);

    return true;
  } catch (error) {
    console.error('Conversation Management Test Failed:', error);
    return false;
  }
}

/**
 * Run all API tests
 */
export async function runApiTests(): Promise<{
  connectivity: boolean;
  streaming: boolean;
  conversations: boolean;
  overall: boolean;
}> {
  console.log('Starting API Integration Tests...');

  const connectivity = await testApiConnectivity();
  const streaming = await testStreamingResponse();
  const conversations = await testConversationManagement();

  const overall = connectivity && streaming && conversations;

  console.log('API Integration Test Results:', {
    connectivity,
    streaming,
    conversations,
    overall
  });

  return {
    connectivity,
    streaming,
    conversations,
    overall
  };
}