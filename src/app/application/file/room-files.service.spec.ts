import { TestBed } from '@angular/core/testing';
import { RoomFilesService } from '@axe/application/file/room-files.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { FileArchiver, LoadResult } from '@axe/core/storage/file-archiver';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** A picker with files chosen in it, as the browser hands one over. */
function pickerWith(files: File[]): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  Object.defineProperty(input, 'value', { value: 'C:\\fakepath\\room.zip', writable: true, configurable: true });
  return input;
}

describe('RoomFilesService', () => {
  let saveRoomAsync: ReturnType<typeof vi.fn>;
  let service: RoomFilesService;

  beforeEach(() => {
    saveRoomAsync = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(SaveDataService, { useValue: { saveRoomAsync } });
    service = TestBed.inject(RoomFilesService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('saving', () => {
    it('counts out the save as it goes, and says it is done a moment after it finishes', async () => {
      vi.useFakeTimers();
      let finish!: () => void;
      saveRoomAsync.mockImplementation((_name: string, progress: (percent: number) => void) => {
        progress(40);
        return new Promise<void>((resolve) => (finish = resolve));
      });

      const saved = service.save();
      expect(service.isSaving()).toBe(true);
      expect(service.progressPercent()).toBe(40);

      finish();
      await saved;
      expect(service.isSaving()).toBe(true);

      vi.advanceTimersByTime(500);
      expect(service.isSaving()).toBe(false);
      expect(service.progressPercent()).toBe(0);
    });

    it('ignores a press while a save is already running', async () => {
      saveRoomAsync.mockReturnValue(new Promise<void>(() => undefined));

      void service.save();
      void service.save();

      expect(saveRoomAsync).toHaveBeenCalledOnce();
    });
  });

  describe('loading what was chosen', () => {
    it('loads the files and clears the picker, so the same file can be chosen again', () => {
      const load = vi.spyOn(TestBed.inject(FileArchiver), 'load').mockResolvedValue({} as LoadResult);
      const room = new File(['x'], 'room.zip');
      const picker = pickerWith([room]);

      service.loadChosen(picker);

      expect(load).toHaveBeenCalledWith([room]);
      expect(picker.value).toBe('');
    });

    it('loads nothing for a seat that may not change the table, and still clears the picker', () => {
      vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
      const load = vi.spyOn(TestBed.inject(FileArchiver), 'load').mockResolvedValue({} as LoadResult);
      const picker = pickerWith([new File(['x'], 'room.zip')]);

      service.loadChosen(picker);

      expect(load).not.toHaveBeenCalled();
      expect(picker.value).toBe('');
    });
  });
});
