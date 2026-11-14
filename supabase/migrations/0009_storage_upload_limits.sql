-- Storage upload limits: private bucket accepts only bounded JPEGs.
-- The verdict API re-encodes every image to JPEG and strips EXIF before upload.
update storage.buckets
set file_size_limit = 6291456,
    allowed_mime_types = array['image/jpeg']::text[]
where id = 'outfits';
