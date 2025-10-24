import type { GetChatResponse } from "@/app/api/chats/[chatId]/route";
import { useOrgSWR } from "./useOrgSWR";

export function useChatMessages(chatId: string | null) {
  return useOrgSWR<GetChatResponse>(chatId ? `/api/chats/${chatId}` : null);
}
