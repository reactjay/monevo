import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User } from '../models/User';
import { ConversationState } from '../models/ConversationState';
import { handleOnboarding, ONBOARDING_WELCOME_MESSAGE, ASK_NAME_MESSAGE, ASK_CURRENCY_MESSAGE, ASK_BUSINESS_NAME_MESSAGE, ASK_BUSINESS_PHONE_MESSAGE, ASK_BUSINESS_ADDRESS_MESSAGE, ONBOARDING_COMPLETED_MESSAGE, INVALID_PROFILE_TYPE_MESSAGE, ONBOARDING_CANCELLED_MESSAGE } from '../services/onboarding/onboardingService';
import { sendTextMessage } from '../services/whatsapp/client';
import { ParsedMessage } from '../types/whatsapp';

jest.mock('../services/whatsapp/client', () => ({
  sendTextMessage: jest.fn().mockResolvedValue(undefined),
  sendImageMessage: jest.fn().mockResolvedValue(undefined),
  sendAudioMessage: jest.fn().mockResolvedValue(undefined),
  uploadMedia: jest.fn().mockResolvedValue('mock-media-id'),
}));

const mockedSendText = jest.mocked(sendTextMessage);

function createMsg(text: string, senderId = '2348100000001'): ParsedMessage {
  return {
    senderId,
    senderName: 'Test User',
    messageId: `wamid.test_${Date.now()}_${Math.random()}`,
    type: 'text',
    text,
    timestamp: new Date(),
  };
}

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
});

describe('User Onboarding Flow', () => {
  // ── Personal Onboarding ──────────────────────────────────────
  describe('Personal onboarding flow', () => {
    it('completes the full personal onboarding flow with default NGN currency', async () => {
      const senderId = '2348100000001';

      // Step 1: User says "Hi" -> receives welcome & profile type prompt
      const handled1 = await handleOnboarding(createMsg('Hi', senderId));
      expect(handled1).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ONBOARDING_WELCOME_MESSAGE);

      const state1 = await ConversationState.findOne({ whatsappId: senderId });
      expect(state1?.state).toBe('AWAITING_PROFILE_TYPE');

      const user1 = await User.findOne({ whatsappId: senderId });
      expect(user1).not.toBeNull();
      expect(user1?.onboardingComplete).toBe(false);

      // Step 2: User chooses 1 (Personal) -> asks for name
      const handled2 = await handleOnboarding(createMsg('1', senderId));
      expect(handled2).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_NAME_MESSAGE);

      const state2 = await ConversationState.findOne({ whatsappId: senderId });
      expect(state2?.state).toBe('AWAITING_NAME');
      expect(state2?.context.profileType).toBe('personal');

      // Step 3: User provides name -> asks for currency
      const handled3 = await handleOnboarding(createMsg('Alex Johnson', senderId));
      expect(handled3).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_CURRENCY_MESSAGE);

      const state3 = await ConversationState.findOne({ whatsappId: senderId });
      expect(state3?.state).toBe('AWAITING_CURRENCY');
      expect(state3?.context.name).toBe('Alex Johnson');

      // Step 4: User selects currency (default / NGN) -> completes onboarding
      const handled4 = await handleOnboarding(createMsg('NGN', senderId));
      expect(handled4).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ONBOARDING_COMPLETED_MESSAGE);

      const state4 = await ConversationState.findOne({ whatsappId: senderId });
      expect(state4?.state).toBe('COMPLETED');

      const completedUser = await User.findOne({ whatsappId: senderId });
      expect(completedUser?.onboardingComplete).toBe(true);
      expect(completedUser?.name).toBe('Alex Johnson');
      expect(completedUser?.profileType).toBe('personal');
      expect(completedUser?.currency).toBe('NGN');
    });

    it('handles personal onboarding with custom currency (USD)', async () => {
      const senderId = '2348100000002';

      await handleOnboarding(createMsg('Hello', senderId));
      await handleOnboarding(createMsg('personal', senderId));
      await handleOnboarding(createMsg('Sarah Connor', senderId));
      await handleOnboarding(createMsg('USD', senderId));

      const user = await User.findOne({ whatsappId: senderId });
      expect(user?.onboardingComplete).toBe(true);
      expect(user?.currency).toBe('USD');
      expect(user?.name).toBe('Sarah Connor');
    });
  });

  // ── Business Onboarding ──────────────────────────────────────
  describe('Business onboarding flow', () => {
    it('completes the full business onboarding flow', async () => {
      const senderId = '2348100000003';

      // Step 1: User says "Hi" -> receives welcome
      await handleOnboarding(createMsg('Hi', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ONBOARDING_WELCOME_MESSAGE);

      // Step 2: User chooses 2 (Business) -> asks for name
      await handleOnboarding(createMsg('2', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_NAME_MESSAGE);

      let state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_NAME');
      expect(state?.context.profileType).toBe('business');

      // Step 3: User provides contact name -> asks for business name
      await handleOnboarding(createMsg('David Miller', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_BUSINESS_NAME_MESSAGE);

      state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_BUSINESS_NAME');
      expect(state?.context.name).toBe('David Miller');

      // Step 4: User provides business name -> asks for business phone
      await handleOnboarding(createMsg('Miller Electronics Ltd', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_BUSINESS_PHONE_MESSAGE);

      state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_PHONE');
      expect(state?.context.businessName).toBe('Miller Electronics Ltd');

      // Step 5: User provides business phone -> asks for business address
      await handleOnboarding(createMsg('+2348012345678', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_BUSINESS_ADDRESS_MESSAGE);

      state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_ADDRESS');
      expect(state?.context.phone).toBe('+2348012345678');

      // Step 6: User provides business address -> asks for currency
      await handleOnboarding(createMsg('12 Marina Road, Lagos, Nigeria', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_CURRENCY_MESSAGE);

      state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_CURRENCY');
      expect(state?.context.businessAddress).toBe('12 Marina Road, Lagos, Nigeria');

      // Step 7: User provides currency -> completes onboarding
      await handleOnboarding(createMsg('default', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ONBOARDING_COMPLETED_MESSAGE);

      const user = await User.findOne({ whatsappId: senderId });
      expect(user?.onboardingComplete).toBe(true);
      expect(user?.profileType).toBe('business');
      expect(user?.name).toBe('David Miller');
      expect(user?.businessName).toBe('Miller Electronics Ltd');
      expect(user?.phone).toBe('+2348012345678');
      expect(user?.businessAddress).toBe('12 Marina Road, Lagos, Nigeria');
      expect(user?.currency).toBe('NGN');
    });
  });

  // ── Invalid Input & Re-prompting ─────────────────────────────
  describe('Invalid inputs and edge cases', () => {
    it('re-prompts and stays in AWAITING_PROFILE_TYPE on invalid profile type selection', async () => {
      const senderId = '2348100000004';

      await handleOnboarding(createMsg('Hi', senderId));
      mockedSendText.mockClear();

      // Send invalid option
      const handled = await handleOnboarding(createMsg('maybe', senderId));
      expect(handled).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, INVALID_PROFILE_TYPE_MESSAGE);

      const state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_PROFILE_TYPE');
    });

    it('keeps state when empty input is sent during name prompt', async () => {
      const senderId = '2348100000005';

      await handleOnboarding(createMsg('Hi', senderId));
      await handleOnboarding(createMsg('1', senderId));
      mockedSendText.mockClear();

      await handleOnboarding(createMsg('   ', senderId));
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ASK_NAME_MESSAGE);

      const state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_NAME');
    });
  });

  // ── Restart Command ──────────────────────────────────────────
  describe('Restart command', () => {
    it('resets onboarding state at any point when user says restart', async () => {
      const senderId = '2348100000006';

      // Start onboarding and advance halfway
      await handleOnboarding(createMsg('Hi', senderId));
      await handleOnboarding(createMsg('2', senderId));
      await handleOnboarding(createMsg('My Business', senderId));

      mockedSendText.mockClear();

      // User says restart
      const handled = await handleOnboarding(createMsg('RESTART', senderId));
      expect(handled).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ONBOARDING_WELCOME_MESSAGE);

      const state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_PROFILE_TYPE');
    });
  });

  // ── Cancel Command ───────────────────────────────────────────
  describe('Cancel command', () => {
    it('cancels onboarding when user says cancel', async () => {
      const senderId = '2348100000007';

      await handleOnboarding(createMsg('Hi', senderId));
      mockedSendText.mockClear();

      const handled = await handleOnboarding(createMsg('cancel', senderId));
      expect(handled).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ONBOARDING_CANCELLED_MESSAGE);

      const state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('NEW');
    });
  });

  // ── Returning User ───────────────────────────────────────────
  describe('Returning user', () => {
    it('returns false so textHandler can handle already-onboarded users', async () => {
      const senderId = '2348100000008';

      // Create an already completed user
      await User.create({
        whatsappId: senderId,
        profileType: 'personal',
        name: 'Existing User',
        currency: 'NGN',
        onboardingComplete: true,
      });

      await ConversationState.create({
        whatsappId: senderId,
        state: 'COMPLETED',
        context: {},
      });

      const handled = await handleOnboarding(createMsg('I spent 5000 on fuel', senderId));
      expect(handled).toBe(false);
      expect(mockedSendText).not.toHaveBeenCalled();
    });

    it('allows returning user to restart onboarding if they send restart', async () => {
      const senderId = '2348100000009';

      await User.create({
        whatsappId: senderId,
        profileType: 'personal',
        name: 'Existing User',
        currency: 'NGN',
        onboardingComplete: true,
      });

      const handled = await handleOnboarding(createMsg('restart', senderId));
      expect(handled).toBe(true);
      expect(mockedSendText).toHaveBeenCalledWith(senderId, ONBOARDING_WELCOME_MESSAGE);

      const state = await ConversationState.findOne({ whatsappId: senderId });
      expect(state?.state).toBe('AWAITING_PROFILE_TYPE');
    });
  });
});
