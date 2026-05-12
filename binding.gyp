{
  "targets": [
    {
      "target_name": "gdal",
      "sources": ["src/gdal.cpp"],
      "include_dirs": [
        "<!(node -e \"require('nan')\")",
        "/usr/include/gdal"
      ],
      "libraries": [
        "-lgdal"
      ]
    }
  ]
}
