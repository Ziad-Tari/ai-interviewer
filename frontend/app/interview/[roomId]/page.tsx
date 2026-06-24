import InterviewRoom from "../../components/InterviewRoom";

type InterviewRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default async function InterviewRoomPage({
  params,
}: InterviewRoomPageProps) {
  const { roomId } = await params;

  return <InterviewRoom roomId={roomId} />;
}
