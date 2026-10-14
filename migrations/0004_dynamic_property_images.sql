UPDATE properties SET image=NULL,
 image_query=COALESCE(NULLIF(image_query,''),location || ' India hotel ' || COALESCE(type,'room') || ' interior');
