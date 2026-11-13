import { Provider } from '@angular/core';
import { VideoEncoderGateway } from '@axe/core/media/video-encoder';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { IndexedDbReplayLogStore } from '@axe/core/storage/indexed-db-replay-log-store';
import { IndexedDbRoomSnapshotStore } from '@axe/core/storage/indexed-db-room-snapshot-store';
import { ModelSharingSystem } from '@axe/core/storage/model-sharing-system';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ReplayLogStore } from '@axe/core/storage/replay-log-store';
import { RoomSnapshotStore } from '@axe/core/storage/room-snapshot-store';
import { SkinImageStore } from '@axe/core/storage/skin-image-store';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';

export const CLASS_SINGLETON_PROVIDERS: Provider[] = [
  { provide: ObjectFactory, useFactory: () => ObjectFactory.instance },
  { provide: ObjectSerializer, useFactory: () => ObjectSerializer.instance },
  { provide: ObjectStore, useFactory: () => ObjectStore.instance },
  { provide: ObjectSynchronizer, useFactory: () => ObjectSynchronizer.instance },

  { provide: FileArchiver, useFactory: () => FileArchiver.instance },
  { provide: AssetHttpStore, useFactory: () => AssetHttpStore.instance },
  { provide: VideoEncoderGateway, useFactory: () => VideoEncoderGateway.instance },
  { provide: ImageStorage, useFactory: () => ImageStorage.instance },
  { provide: ImageSharingSystem, useFactory: () => ImageSharingSystem.instance },
  { provide: AudioStorage, useFactory: () => AudioStorage.instance },
  { provide: AudioSharingSystem, useFactory: () => AudioSharingSystem.instance },
  { provide: ModelStorage, useFactory: () => ModelStorage.instance },
  { provide: ModelSharingSystem, useFactory: () => ModelSharingSystem.instance },
  { provide: RoomSnapshotStore, useFactory: () => IndexedDbRoomSnapshotStore.instance },
  { provide: ReplayLogStore, useFactory: () => IndexedDbReplayLogStore.instance },
  { provide: StartRoomStore, useFactory: () => StartRoomStore.instance },
  { provide: SkinImageStore, useFactory: () => SkinImageStore.instance },
];
