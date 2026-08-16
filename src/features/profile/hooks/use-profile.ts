"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const SESSIONS_QUERY_KEY = ["auth-sessions"];

/**
 * Hook to update the current user's display name.
 */
export const useUpdateProfile = () => {
  return useMutation({
    mutationFn: async (input: { name: string }) => {
      const { error } = await authClient.updateUser(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Profile updated");
    },
    onError: (error) => {
      toast.error(`Failed to update profile: ${error.message}`);
    },
  });
};

/**
 * Hook to change the current user's password.
 */
export const useChangePassword = () => {
  return useMutation({
    mutationFn: async (input: { currentPassword: string; newPassword: string }) => {
      const { error } = await authClient.changePassword(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Password changed");
    },
    onError: (error) => {
      toast.error(`Failed to change password: ${error.message}`);
    },
  });
};

/**
 * Hook to list the current user's active sessions.
 */
export const useSessions = () => {
  return useQuery({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.listSessions();
      if (error) throw new Error(error.message);
      return data;
    },
  });
};

/**
 * Hook to revoke a session other than the current one.
 */
export const useRevokeSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { token: string }) => {
      const { error } = await authClient.revokeSession(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Session revoked");
      queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to revoke session: ${error.message}`);
    },
  });
};
