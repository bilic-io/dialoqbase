// import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import { QSource } from "../type";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { DialoqbaseVectorStore } from "../../utils/store";
import { embeddings } from "../../utils/embeddings";
import { DialoqbaseAudioVideoLoader } from "../../loader/audio-video";
import { convertMp3ToWave } from "../../utils/ffmpeg";
import { PrismaClient } from "@prisma/client";
import { consumeDataSource, validateDataSource } from "../../utils/common";

export const audioQueueController = async (
  source: QSource,
  prisma: PrismaClient
): Promise<[boolean, number]> => {
  console.log("loading audio");

  const location = source.location!;

  const videoWav = await convertMp3ToWave(location);

  const loader = new DialoqbaseAudioVideoLoader(videoWav);
  const docs = await loader.load();

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const chunks = await textSplitter.splitDocuments(docs);

  const embeddingInfo = await prisma.dialoqbaseModels.findFirst({
    where: {
      model_id: source.embedding,
      hide: false,
      deleted: false,
    },
  });

  if (!embeddingInfo) {
    throw new Error("Embedding not found. Please verify the embedding id");
  }

  const bot = await prisma.bot.findFirst({ where: { id: source.botId } });
  const [isValid, sourceChars] = validateDataSource(chunks, bot);
  if (!isValid) return [false, sourceChars];

  await DialoqbaseVectorStore.fromDocuments(
    chunks,
    embeddings(
      embeddingInfo.model_provider!.toLowerCase(),
      embeddingInfo.model_id,
      embeddingInfo?.config
    ),
    {
      botId: source.botId,
      sourceId: source.id,
    }
  );

  consumeDataSource(chunks, prisma, source.botId);
  return [true, sourceChars];
};
