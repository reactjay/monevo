import { Types } from 'mongoose';
import { User, IUserDocument } from '../../models/User';
import { IUser } from '../../types/models';

/**
 * Retrieves a user profile by ObjectId or string ID.
 */
export async function getUserProfile(
  userId: Types.ObjectId | string
): Promise<IUserDocument | null> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  return User.findById(userObjectId).exec();
}

/**
 * Safely updates profile fields for a user.
 */
export async function updateUserProfile(
  userId: Types.ObjectId | string,
  updates: Partial<Pick<IUser, 'name' | 'phone' | 'businessName' | 'businessAddress' | 'currency' | 'profileType' | 'responseMode' | 'weeklyReportsEnabled'>>
): Promise<IUserDocument | null> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  const allowedUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) allowedUpdates.name = updates.name.trim();
  if (updates.phone !== undefined) allowedUpdates.phone = updates.phone.trim();
  if (updates.businessName !== undefined) allowedUpdates.businessName = updates.businessName.trim();
  if (updates.businessAddress !== undefined) allowedUpdates.businessAddress = updates.businessAddress.trim();
  if (updates.currency !== undefined) allowedUpdates.currency = updates.currency.toUpperCase().trim();
  if (updates.profileType !== undefined) allowedUpdates.profileType = updates.profileType;
  if (updates.responseMode !== undefined) allowedUpdates.responseMode = updates.responseMode;
  if (updates.weeklyReportsEnabled !== undefined) allowedUpdates.weeklyReportsEnabled = updates.weeklyReportsEnabled;

  return User.findByIdAndUpdate(userObjectId, { $set: allowedUpdates }, { returnDocument: 'after' }).exec();
}
