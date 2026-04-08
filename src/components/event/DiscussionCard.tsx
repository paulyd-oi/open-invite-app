import React from "react";
import { Pressable, View, Text, TextInput, ActivityIndicator } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { Image as ExpoImage } from "expo-image";
import { MessageCircle, ImagePlus, X, Trash2 } from "@/ui/icons";
import { EntityAvatar } from "@/components/EntityAvatar";
import { toCloudinaryTransformedUrl, CLOUDINARY_PRESETS } from "@/lib/mediaTransformSSOT";
import { getDiscussionPrompts, inferEventTags } from "@/lib/discussionPromptSSOT";
import { devLog } from "@/lib/devLog";

interface CommentUser {
  name: string | null;
  image: string | null;
}

interface Comment {
  id: string;
  userId: string;
  content: string | null;
  imageUrl: string | null;
  createdAt: string;
  user: CommentUser;
}

interface JoinRequest {
  status: string;
}

interface DiscussionCardColors {
  text: string;
  textSecondary: string;
  textTertiary: string;
  surface: string;
  border: string;
}

interface DiscussionCardProps {
  comments: Comment[];
  isLoadingComments: boolean;
  commentText: string;
  commentImage: string | null;
  isUploadingImage: boolean;
  isPostingComment: boolean;
  isMyEvent: boolean;
  currentUserId: string | undefined;
  joinRequests: JoinRequest[] | null | undefined;
  // Event data for discussion prompts
  eventId: string;
  eventTitle: string | undefined;
  eventDescription: string | null | undefined;
  eventLocation: string | null | undefined;
  eventStartTime: string | null | undefined;
  eventEndTime: string | null | undefined;
  eventVisibility: string | null | undefined;
  isDark: boolean;
  themeColor: string;
  colors: DiscussionCardColors;
  onChangeCommentText: (text: string) => void;
  onClearCommentImage: () => void;
  onPickImage: () => void;
  onPostComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onPressUser: (userId: string) => void;
  formatTimeAgo: (date: string) => string;
  hasMoreComments?: boolean;
  isFetchingMoreComments?: boolean;
  onLoadMoreComments?: () => void;
}

export function DiscussionCard({
  comments,
  isLoadingComments,
  commentText,
  commentImage,
  isUploadingImage,
  isPostingComment,
  isMyEvent,
  currentUserId,
  joinRequests,
  eventId,
  eventTitle,
  eventDescription,
  eventLocation,
  eventStartTime,
  eventEndTime,
  eventVisibility,
  isDark,
  themeColor,
  colors,
  onChangeCommentText,
  onClearCommentImage,
  onPickImage,
  onPostComment,
  onDeleteComment,
  onPressUser,
  formatTimeAgo,
  hasMoreComments,
  isFetchingMoreComments,
  onLoadMoreComments,
}: DiscussionCardProps) {
  const acceptedCount = joinRequests?.filter((r) => r.status === "accepted").length ?? 0;

  return (
    <Animated.View entering={FadeInDown.delay(130).springify()}>
      <View className="mb-3">
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Discussion
          </Text>
          {comments.length > 0 && (
            <View style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: `${themeColor}14` }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: themeColor }}>
                {comments.length}
              </Text>
            </View>
          )}
        </View>

        {/* Conversation encouragement for events with attendees */}
        {acceptedCount >= 2 && comments.length === 0 && (
          <View
            className="rounded-xl p-3 mb-3 flex-row items-center"
            style={{ backgroundColor: `${themeColor}15`, borderWidth: 1, borderColor: `${themeColor}30` }}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: `${themeColor}25` }}>
              <MessageCircle size={16} color={themeColor} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium" style={{ color: colors.text }}>
                Start the conversation!
              </Text>
              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                Coordinate plans with others who are attending
              </Text>
            </View>
          </View>
        )}

        {/* Comment Input */}
        <View className="rounded-2xl p-4 mb-3" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          {commentImage && (
            <View className="mb-3 relative">
              {/* INVARIANT_ALLOW_RAW_IMAGE_CONTENT — comment image preview, Cloudinary-transformed */}
              <ExpoImage
                source={{ uri: toCloudinaryTransformedUrl(commentImage, CLOUDINARY_PRESETS.THUMBNAIL_SQUARE) }}
                style={{ width: "100%", height: 160, borderRadius: 12 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                priority="normal"
              />
              <Pressable
                onPress={onClearCommentImage}
                className="absolute top-2 right-2 w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
              >
                <X size={16} color="#fff" />
              </Pressable>
            </View>
          )}
          <View className="flex-row items-end">
            <View className="flex-1 rounded-xl mr-2" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
              <TextInput
                testID="event-detail-comment-input"
                value={commentText}
                onChangeText={onChangeCommentText}
                placeholder="Add a comment..."
                placeholderTextColor="#9CA3AF"
                multiline
                className="p-3 max-h-24"
                style={{ color: colors.text }}
              />
            </View>
            <Pressable
              onPress={onPickImage}
              disabled={isUploadingImage}
              className="w-10 h-10 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: isDark ? "#2C2C2E" : "#F3F4F6" }}
            >
              {isUploadingImage ? (
                <ActivityIndicator size="small" color={themeColor} />
              ) : (
                <ImagePlus size={20} color={commentImage ? themeColor : "#9CA3AF"} />
              )}
            </Pressable>
            <Pressable
              testID="event-detail-comment-submit"
              onPress={onPostComment}
              disabled={isPostingComment || isUploadingImage || (!commentText.trim() && !commentImage)}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{
                backgroundColor: commentText.trim() || commentImage ? themeColor : isDark ? "#2C2C2E" : "#E5E7EB"
              }}
            >
              {isPostingComment ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MessageCircle size={18} color={commentText.trim() || commentImage ? "#fff" : "#9CA3AF"} />
              )}
            </Pressable>
          </View>
        </View>

        {/* Comments List */}
        {isLoadingComments ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={themeColor} />
          </View>
        ) : comments.length === 0 ? (
          <View className="rounded-xl p-6 items-center" style={{ backgroundColor: isDark ? "#2C2C2E" : "#F9FAFB" }}>
            <MessageCircle size={32} color="#9CA3AF" />
            <Text className="font-medium mt-2" style={{ color: colors.text }}>
              No messages yet
            </Text>
            <Text className="text-center text-sm mt-1 mb-4" style={{ color: colors.textSecondary }}>
              Break the ice! Start a conversation
            </Text>
            {/* [DISCUSS_PROMPTS] Smart conversation starters */}
            <View className="w-full">
              <Text className="text-xs font-medium mb-2" style={{ color: colors.textTertiary }}>
                Try asking:
              </Text>
              {(() => {
                const prompts = getDiscussionPrompts({
                  eventId,
                  title: eventTitle,
                  description: eventDescription ?? undefined,
                  locationName: eventLocation ?? undefined,
                  startAt: eventStartTime ?? undefined,
                  endAt: eventEndTime ?? undefined,
                  isHost: isMyEvent,
                  visibility: eventVisibility ?? undefined,
                });
                if (__DEV__) {
                  devLog("[DISCUSS_PROMPTS]", `eventId=${eventId?.slice(0, 8)} tags=${inferEventTags(eventTitle, eventLocation ?? undefined, eventDescription ?? undefined).join(",") || "none"} prompts="${prompts.map(p => p.text).join("|")}"`);
                }
                return prompts;
              })().map((prompt) => (
                <Pressable
                  key={prompt.id}
                  onPress={() => onChangeCommentText(prompt.text)}
                  className="rounded-lg p-2 mb-1"
                  style={{ backgroundColor: isDark ? "#3C3C3E" : "#F3F4F6" }}
                >
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {prompt.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View>
            {/* Load earlier comments */}
            {hasMoreComments && (
              <Pressable
                onPress={onLoadMoreComments}
                disabled={isFetchingMoreComments}
                style={{
                  alignItems: "center",
                  paddingVertical: 10,
                  marginBottom: 8,
                }}
              >
                {isFetchingMoreComments ? (
                  <ActivityIndicator size="small" color={themeColor} />
                ) : (
                  <Text style={{ fontSize: 13, fontWeight: "600", color: themeColor }}>
                    Load earlier messages
                  </Text>
                )}
              </Pressable>
            )}
            {comments.map((comment, index) => (
              <Animated.View
                key={comment.id}
                entering={FadeIn.delay(index * 50)}
              >
                <Pressable
                  onPress={() => onPressUser(comment.userId)}
                  className="rounded-xl p-4 mb-2"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                  <View className="flex-row">
                    <EntityAvatar
                      photoUrl={comment.user.image}
                      initials={comment.user.name?.[0] ?? "?"}
                      size={40}
                      backgroundColor={isDark ? "#2C2C2E" : "#FFF7ED"}
                      foregroundColor={themeColor}
                      style={{ marginRight: 12 }}
                    />
                    <View className="flex-1">
                      <View className="flex-row items-center justify-between">
                        <Text className="font-semibold" style={{ color: colors.text }}>
                          {comment.user.name ?? "User"}
                        </Text>
                        <View className="flex-row items-center">
                          <Text className="text-xs" style={{ color: colors.textTertiary }}>
                            {formatTimeAgo(comment.createdAt)}
                          </Text>
                          {(comment.userId === currentUserId || isMyEvent) && (
                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation();
                                onDeleteComment(comment.id);
                              }}
                              className="ml-2 p-1"
                            >
                              <Trash2 size={14} color="#9CA3AF" />
                            </Pressable>
                          )}
                        </View>
                      </View>
                      {comment.content && (
                        <Text className="mt-1" style={{ color: colors.textSecondary }}>{comment.content}</Text>
                      )}
                      {comment.imageUrl && (
                        // INVARIANT_ALLOW_RAW_IMAGE_CONTENT — comment image display, Cloudinary-transformed
                        <ExpoImage
                          source={{ uri: toCloudinaryTransformedUrl(comment.imageUrl, CLOUDINARY_PRESETS.THUMBNAIL_SQUARE) }}
                          style={{ width: "100%", height: 192, borderRadius: 12, marginTop: 8 }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={200}
                          priority="normal"
                        />
                      )}
                    </View>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}
