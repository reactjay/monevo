import { ParsedMessage } from '../../types/whatsapp';
import { User } from '../../models/User';
import { ConversationState } from '../../models/ConversationState';
import { sendTextMessage } from '../whatsapp/client';

export type OnboardingState =
  | 'NEW'
  | 'AWAITING_PROFILE_TYPE'
  | 'AWAITING_NAME'
  | 'AWAITING_BUSINESS_NAME'
  | 'AWAITING_PHONE'
  | 'AWAITING_ADDRESS'
  | 'AWAITING_CURRENCY'
  | 'COMPLETED';

export const ONBOARDING_WELCOME_MESSAGE = `Welcome to *Monevo*! 👋 I'm your WhatsApp AI financial assistant.

Before we begin, are you using me for:

1. Personal finances
2. Business finances`;

export const ASK_NAME_MESSAGE = `What's your name?`;

export const ASK_CURRENCY_MESSAGE = `What currency do you normally use?`;

export const ASK_BUSINESS_NAME_MESSAGE = `What is your business name?`;

export const ASK_BUSINESS_PHONE_MESSAGE = `What is your business phone number?`;

export const ASK_BUSINESS_ADDRESS_MESSAGE = `What is your business address?`;

export const ONBOARDING_COMPLETED_MESSAGE = `You're all set. 🎉

You can now send things like:

'I spent ₦5,000 on fuel'

'I received ₦150,000 from David'

'How much did I spend this week?'

'Create a receipt for the payment from David'`;

export function getOnboardingCompletedMessage(currency = 'NGN'): string {
  const sym = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '₦';
  return `You're all set. 🎉

You can now send things like:

'I spent ${sym}5,000 on fuel'

'I received ${sym}150,000 from David'

'How much did I spend this week?'

'Create a receipt for the payment from David'`;
}

export const INVALID_PROFILE_TYPE_MESSAGE = `Please choose:
1. Personal finances
2. Business finances`;

export const ONBOARDING_CANCELLED_MESSAGE = `Onboarding cancelled. You can send 'Hi' or 'restart' whenever you're ready to start again.`;

export function normalizeCurrency(input: string): string {
  const clean = input.trim().toUpperCase();
  if (
    !clean ||
    clean === 'DEFAULT' ||
    clean === 'SKIP' ||
    clean === 'NAIRA' ||
    clean === '₦' ||
    clean === 'NGN'
  ) {
    return 'NGN';
  }
  if (clean === 'DOLLAR' || clean === 'DOLLARS' || clean === '$' || clean === 'USD') {
    return 'USD';
  }
  if (clean === 'POUND' || clean === 'POUNDS' || clean === '£' || clean === 'GBP') {
    return 'GBP';
  }
  if (clean === 'EURO' || clean === 'EUROS' || clean === '€' || clean === 'EUR') {
    return 'EUR';
  }
  const match = clean.match(/^[A-Z]{3}$/);
  if (match) {
    return match[0];
  }
  return clean.slice(0, 5) || 'NGN';
}

/**
 * Handles onboarding flow for a WhatsApp user.
 * Returns true if the message was handled as part of onboarding,
 * or false if the user is already onboarded and should proceed to regular handlers.
 */
export async function handleOnboarding(message: ParsedMessage): Promise<boolean> {
  const text = message.text?.trim() ?? '';
  const lowerText = text.toLowerCase();
  const whatsappId = message.senderId;

  // Check if user exists and is already onboarded
  const user = await User.findOne({ whatsappId });
  const convState = await ConversationState.findOne({ whatsappId });

  const isOnboardingState =
    convState &&
    [
      'AWAITING_PROFILE_TYPE',
      'AWAITING_NAME',
      'AWAITING_BUSINESS_NAME',
      'AWAITING_PHONE',
      'AWAITING_ADDRESS',
      'AWAITING_CURRENCY',
    ].includes(convState.state);

  // Global command: restart
  if (lowerText === 'restart') {
    await ConversationState.findOneAndUpdate(
      { whatsappId },
      { state: 'AWAITING_PROFILE_TYPE', context: {} },
      { upsert: true, returnDocument: 'after' }
    );
    await User.findOneAndUpdate(
      { whatsappId },
      { onboardingComplete: false },
      { upsert: true }
    );
    await sendTextMessage(whatsappId, ONBOARDING_WELCOME_MESSAGE);
    return true;
  }

  // If user is already onboarded and not actively in onboarding questions
  if (user?.onboardingComplete && !isOnboardingState) {
    return false;
  }

  // Global command: cancel during onboarding
  if (lowerText === 'cancel') {
    await ConversationState.findOneAndUpdate(
      { whatsappId },
      { state: 'NEW', context: {} },
      { upsert: true }
    );
    await sendTextMessage(whatsappId, ONBOARDING_CANCELLED_MESSAGE);
    return true;
  }

  // If brand new user or conversation state is NEW
  if (!convState || convState.state === 'NEW') {
    await ConversationState.findOneAndUpdate(
      { whatsappId },
      { state: 'AWAITING_PROFILE_TYPE', context: {} },
      { upsert: true, returnDocument: 'after' }
    );
    await User.findOneAndUpdate(
      { whatsappId },
      {
        $setOnInsert: {
          whatsappId,
          profileType: 'personal',
          onboardingComplete: false,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );
    await sendTextMessage(whatsappId, ONBOARDING_WELCOME_MESSAGE);
    return true;
  }

  const currentState = convState.state as OnboardingState;
  const context = (convState.context as Record<string, unknown>) ?? {};

  switch (currentState) {
    case 'AWAITING_PROFILE_TYPE': {
      if (lowerText === '1' || lowerText.includes('personal')) {
        context.profileType = 'personal';
        await ConversationState.findOneAndUpdate(
          { whatsappId },
          { state: 'AWAITING_NAME', context }
        );
        await sendTextMessage(whatsappId, ASK_NAME_MESSAGE);
      } else if (lowerText === '2' || lowerText.includes('business')) {
        context.profileType = 'business';
        await ConversationState.findOneAndUpdate(
          { whatsappId },
          { state: 'AWAITING_NAME', context }
        );
        await sendTextMessage(whatsappId, ASK_NAME_MESSAGE);
      } else {
        await sendTextMessage(whatsappId, INVALID_PROFILE_TYPE_MESSAGE);
      }
      return true;
    }

    case 'AWAITING_NAME': {
      if (!text) {
        await sendTextMessage(whatsappId, ASK_NAME_MESSAGE);
        return true;
      }
      const cleanedName = text
        .replace(/^(my name is|call me|i am|i'm|it's|this is)\s+/i, '')
        .trim();
      context.name = cleanedName || text;

      if (context.profileType === 'business') {
        await ConversationState.findOneAndUpdate(
          { whatsappId },
          { state: 'AWAITING_BUSINESS_NAME', context }
        );
        await sendTextMessage(whatsappId, ASK_BUSINESS_NAME_MESSAGE);
      } else {
        await ConversationState.findOneAndUpdate(
          { whatsappId },
          { state: 'AWAITING_CURRENCY', context }
        );
        await sendTextMessage(whatsappId, ASK_CURRENCY_MESSAGE);
      }
      return true;
    }

    case 'AWAITING_BUSINESS_NAME': {
      if (!text) {
        await sendTextMessage(whatsappId, ASK_BUSINESS_NAME_MESSAGE);
        return true;
      }
      context.businessName = text;
      await ConversationState.findOneAndUpdate(
        { whatsappId },
        { state: 'AWAITING_PHONE', context }
      );
      await sendTextMessage(whatsappId, ASK_BUSINESS_PHONE_MESSAGE);
      return true;
    }

    case 'AWAITING_PHONE': {
      if (!text) {
        await sendTextMessage(whatsappId, ASK_BUSINESS_PHONE_MESSAGE);
        return true;
      }
      context.phone = lowerText === 'same' ? whatsappId : text;
      await ConversationState.findOneAndUpdate(
        { whatsappId },
        { state: 'AWAITING_ADDRESS', context }
      );
      await sendTextMessage(whatsappId, ASK_BUSINESS_ADDRESS_MESSAGE);
      return true;
    }

    case 'AWAITING_ADDRESS': {
      if (!text) {
        await sendTextMessage(whatsappId, ASK_BUSINESS_ADDRESS_MESSAGE);
        return true;
      }
      context.businessAddress = text;
      await ConversationState.findOneAndUpdate(
        { whatsappId },
        { state: 'AWAITING_CURRENCY', context }
      );
      await sendTextMessage(whatsappId, ASK_CURRENCY_MESSAGE);
      return true;
    }

    case 'AWAITING_CURRENCY': {
      const currency = normalizeCurrency(text);
      const profileType = (context.profileType as 'personal' | 'business') || 'personal';

      await User.findOneAndUpdate(
        { whatsappId },
        {
          whatsappId,
          profileType,
          name: (context.name as string) || message.senderName || 'User',
          phone: (context.phone as string) || whatsappId,
          businessName: context.businessName as string,
          businessAddress: context.businessAddress as string,
          currency,
          onboardingComplete: true,
        },
        { upsert: true, returnDocument: 'after' }
      );

      await ConversationState.findOneAndUpdate(
        { whatsappId },
        { state: 'COMPLETED', context: {} }
      );

      await sendTextMessage(whatsappId, getOnboardingCompletedMessage(currency));
      return true;
    }

    case 'COMPLETED': {
      return false;
    }

    default: {
      return false;
    }
  }
}
